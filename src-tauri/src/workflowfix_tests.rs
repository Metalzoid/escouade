//! Tests of the corrections of a project's workflows (ESC-195), on the reading of the frozen copy
//! of GSD (`tests/fixtures/workflows/gsd`).

use crate::workflow::{read, Roots, Workflow};
use crate::workflowfix::*;
use std::path::{Path, PathBuf};

fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../tests/fixtures/workflows")
        .join(name)
}

fn gsd() -> Workflow {
    let home = fixture("gsd").join("home");
    let roots = Roots {
        claude: Some(home.join(".claude")),
        codex: Some(home.join(".codex")),
        home,
    };
    read(&fixture("gsd/project"), &[], &roots, &[])
        .workflows
        .remove(0)
}

fn names(w: &Workflow) -> Vec<&str> {
    w.steps.iter().map(|s| s.name.as_str()).collect()
}

fn step(name: &str, from: &[&str]) -> FixStep {
    FixStep {
        name: name.into(),
        from: from.iter().map(|s| s.to_string()).collect(),
        signals: Vec::new(),
    }
}

fn fix(w: &Workflow, steps: Vec<FixStep>, removed: &[&str]) -> Fix {
    Fix {
        workflow: w.id.clone(),
        dismissed: false,
        steps,
        removed: removed.iter().map(|s| s.to_string()).collect(),
    }
}

#[test]
fn no_correction_is_the_reading() {
    let w = gsd();
    assert_eq!(apply(&w, None), Some(w.clone()));
    assert_eq!(apply(&w, Some(&fix(&w, vec![], &[]))), Some(w.clone()));
}

#[test]
fn renamed_steps_keep_their_agents_and_their_ways_back() {
    let w = gsd();
    let f = fix(
        &w,
        vec![
            step("Discuter", &["gsd:discuss-phase"]),
            step("Planifier", &["gsd:plan-phase"]),
            step("Exécuter", &["gsd:execute-phase"]),
            step("Vérifier", &["gsd:verify-work"]),
        ],
        &[],
    );
    let got = apply(&w, Some(&f)).unwrap();
    assert_eq!(
        names(&got),
        ["Discuter", "Planifier", "Exécuter", "Vérifier"]
    );
    assert_eq!(got.steps[1].command, "/gsd:plan-phase");
    assert!(got.steps[1].agents.iter().any(|a| a.name == "gsd-planner"));
    assert!(got
        .transitions
        .iter()
        .any(|t| t.from == "Vérifier" && t.to == "Planifier" && t.back));
    assert!(got
        .transitions
        .iter()
        .any(|t| t.from == "Planifier" && t.to == "Planifier" && t.max == Some(3)));
}

#[test]
fn merged_steps_are_one_with_the_agents_of_both() {
    let w = gsd();
    let f = fix(
        &w,
        vec![
            step("Préparer", &["gsd:discuss-phase", "gsd:plan-phase"]),
            step("", &["gsd:execute-phase"]),
            step("", &["gsd:verify-work"]),
        ],
        &[],
    );
    let got = apply(&w, Some(&f)).unwrap();
    // Unnamed, a step keeps the reading's name.
    assert_eq!(
        names(&got),
        ["Préparer", "gsd:execute-phase", "gsd:verify-work"]
    );
    assert_eq!(got.steps[0].command, "/gsd:discuss-phase");
    assert!(got.steps[0].agents.iter().any(|a| a.name == "gsd-planner"));
    // The way from one to the other is inside it now; the way back from verifying comes to it.
    assert!(!got
        .transitions
        .iter()
        .any(|t| t.from == "Préparer" && t.to == "Préparer" && !t.back));
    assert!(got
        .transitions
        .iter()
        .any(|t| t.from == "gsd:verify-work" && t.to == "Préparer" && t.back));
}

#[test]
fn a_step_removed_goes_with_its_ways_and_one_reordered_moves() {
    let w = gsd();
    let f = fix(
        &w,
        vec![
            step("", &["gsd:plan-phase"]),
            step("", &["gsd:discuss-phase"]),
            step("", &["gsd:execute-phase"]),
        ],
        &["gsd:verify-work"],
    );
    let got = apply(&w, Some(&f)).unwrap();
    assert_eq!(
        names(&got),
        ["gsd:plan-phase", "gsd:discuss-phase", "gsd:execute-phase"]
    );
    assert_eq!(
        got.steps.iter().map(|s| s.order).collect::<Vec<_>>(),
        [0, 1, 2]
    );
    assert!(!got
        .transitions
        .iter()
        .any(|t| t.from == "gsd:verify-work" || t.to == "gsd:verify-work"));
    // Discussing now after planning: the way from it to planning goes back.
    assert!(got
        .transitions
        .iter()
        .any(|t| t.from == "gsd:discuss-phase" && t.to == "gsd:plan-phase" && t.back));
}

#[test]
fn a_step_added_by_hand_is_told_by_its_signals() {
    let w = gsd();
    let mut added = step("Livrer", &[]);
    added.signals = vec![
        Signal::Command("/gsd:ship".into()),
        Signal::Agent("gsd-shipper".into()),
        Signal::File(".planning/SHIPPED.md".into()),
    ];
    let mut steps: Vec<FixStep> = w.steps.iter().map(|s| step("", &[&s.name])).collect();
    steps.push(added);
    let got = apply(&w, Some(&fix(&w, steps, &[]))).unwrap();
    let last = got.steps.last().unwrap();
    assert_eq!(last.name, "Livrer");
    assert_eq!(last.command, "/gsd:ship");
    assert_eq!(last.agents[0].name, "gsd-shipper");
    assert_eq!(last.writes, [".planning/SHIPPED.md"]);
    assert_eq!(last.order, 4);
}

#[test]
fn a_guessed_step_kept_is_no_longer_guessed_and_one_removed_is_gone() {
    let mut w = gsd();
    w.steps[3].guessed = true;
    let kept = fix(
        &w,
        w.steps.iter().map(|s| step("", &[&s.name])).collect(),
        &[],
    );
    assert!(apply(&w, Some(&kept))
        .unwrap()
        .steps
        .iter()
        .all(|s| !s.guessed));
    let removed = fix(
        &w,
        w.steps[..3].iter().map(|s| step("", &[&s.name])).collect(),
        &["gsd:verify-work"],
    );
    assert_eq!(apply(&w, Some(&removed)).unwrap().steps.len(), 3);
}

#[test]
fn corrections_go_before_a_new_reading_what_no_longer_matches_is_left_out() {
    let w = gsd();
    let f = fix(
        &w,
        vec![
            step("Discuter", &["gsd:discuss-phase"]),
            step("Ancienne", &["gsd:gone"]),
            step("Planifier", &["gsd:plan-phase"]),
        ],
        &[],
    );
    let got = apply(&w, Some(&f)).unwrap();
    // The one of a step gone is left out; the steps read and not listed come after, as read.
    assert_eq!(
        names(&got),
        [
            "Discuter",
            "Planifier",
            "gsd:execute-phase",
            "gsd:verify-work"
        ]
    );
}

#[test]
fn a_workflow_dismissed_is_none_and_the_others_stay() {
    let w = gsd();
    let mut f = fix(&w, vec![], &[]);
    f.dismissed = true;
    assert_eq!(apply(&w, Some(&f)), None);
    assert!(effective(std::slice::from_ref(&w), &[f]).is_empty());
    assert_eq!(effective(std::slice::from_ref(&w), &[]), [w]);
}

#[test]
fn corrections_are_kept_trimmed_one_per_workflow_without_those_that_change_nothing() {
    let got = cleaned(vec![
        Fix {
            workflow: " a ".into(),
            steps: vec![step(" X ", &["s"]), step("", &[])],
            ..Default::default()
        },
        Fix {
            workflow: "b".into(),
            ..Default::default()
        },
        Fix {
            workflow: "a".into(),
            removed: vec!["t".into()],
            ..Default::default()
        },
    ]);
    assert_eq!(got.len(), 1);
    assert_eq!(got[0].workflow, "a");
    assert_eq!(got[0].removed, ["t"]);
}
