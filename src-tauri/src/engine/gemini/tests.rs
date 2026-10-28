//! The engine of Gemini CLI alone: its modes, models, rules, settings and questions.

use super::*;

#[test]
fn each_mode_of_escouade_has_its_mode_in_gemini_and_says_there_is_no_sandbox() {
    assert_eq!(gemini_mode("default"), "default");
    assert_eq!(gemini_mode("plan"), "plan");
    assert_eq!(gemini_mode("acceptEdits"), "autoEdit");
    assert_eq!(gemini_mode("bypassPermissions"), "yolo");
    for mode in MODES {
        assert_eq!(escouade_mode(gemini_mode(mode)), Some(mode));
        let (fr, en) = (meaning(Lang::Fr, mode), meaning(Lang::En, mode));
        assert!(fr != en && fr.contains("bac à sable") && en.contains("sandbox"));
    }
    assert_eq!(mode_update("[MODE_UPDATE] plan"), Some("plan"));
    assert_eq!(mode_update("[MODE_UPDATE] autoEdit"), Some("acceptEdits"));
    assert_eq!(mode_update("Le mode [MODE_UPDATE] plan"), None);
    let c = caps();
    assert!(!c.modes.iter().any(|m| m.id == "auto"));
    assert_eq!(c.fork, ForkPoint::None);
    assert!(!c.effort && c.read_only);
    assert!(!GEMINI.supports_auto(DEFAULT) && !GEMINI.supports_effort(DEFAULT));
}

#[test]
fn the_models_of_a_session_make_the_menu() {
    let new = bench::stream("02-simple-turn.jsonl")
        .into_iter()
        .find(|m| m["result"]["models"].is_object())
        .unwrap();
    let told = models_of(&new["result"]["models"]);
    assert!(told.len() >= 2, "{told:?}");
    assert_eq!(told[0].id, "auto");
    assert!(told[0].default && told.iter().filter(|m| m.default).count() == 1);
    assert!(told.iter().all(|m| m.efforts.is_empty()));
    assert_eq!(catalog(&[])[0].id, DEFAULT);
    assert_eq!(
        writer_model(Weight::Light, &told).as_deref(),
        Some("gemini-3.5-flash-lite")
    );
    assert_eq!(
        writer_model(Weight::Reading, &told).as_deref(),
        Some("gemini-3.8-flash")
    );
}

#[test]
fn a_question_is_kept_out_of_the_thread_even_cut_in_pieces() {
    let block = r#"<escouade_question>{"questions": [{"question": "Rouge ou bleu ?", "options": ["rouge", "bleu"], "multiSelect": false}]}</escouade_question>"#;
    let text = format!("Il me faut ton choix.\n{block}");
    for size in [1, 3, 7, 12, 200] {
        let mut f = QuestionFilter::default();
        let mut shown = String::new();
        let chars: Vec<char> = text.chars().collect();
        for piece in chars.chunks(size) {
            shown.push_str(&f.push(&piece.iter().collect::<String>()));
        }
        shown.push_str(&f.flush());
        assert_eq!(shown, "Il me faut ton choix.\n", "pieces of {size}");
        let kept = f.take_block().expect("the block");
        let params = question_params("c1", &kept).unwrap();
        assert_eq!(params["questions"][0]["prompt"], "Rouge ou bleu ?");
        assert_eq!(params["questions"][0]["options"][1]["label"], "bleu");
        assert_eq!(params["questions"][0]["allowMultiple"], false);
    }
    // A text that only looks like the start of the tag is shown whole.
    let mut f = QuestionFilter::default();
    let mut shown = f.push("a <esc");
    shown.push_str(&f.push("ape> b"));
    shown.push_str(&f.flush());
    assert_eq!(shown, "a <escape> b");
    assert!(f.take_block().is_none());
    // A block that is no question.
    assert!(question_params("c", "<escouade_question>pas du json</escouade_question>").is_none());
    let answers = answers_message(
        &question_params("c", block).unwrap(),
        &json!({ "Rouge ou bleu ?": "rouge" }),
    );
    assert_eq!(
        answers,
        "The user answered your questions:\n- Rouge ou bleu ? → rouge"
    );
    assert!(QUESTIONS.contains(QUESTION_OPEN) && QUESTIONS.contains(QUESTION_CLOSE));
}

#[test]
fn the_rules_refuse_the_fence_to_its_file_tools_and_commands_whatever_the_separators() {
    assert_eq!(policy(&[], false), None);
    let rules = policy(&["C:\\x\\Privé.v1".into()], false).unwrap();
    let doc: toml_edit::DocumentMut = rules.parse().expect("TOML");
    let list = doc["rule"].as_array_of_tables().unwrap();
    assert_eq!(list.len(), 2);
    assert_eq!(list.get(0).unwrap()["decision"].as_str(), Some("deny"));
    assert_eq!(
        list.get(1).unwrap()["toolName"].as_str(),
        Some("run_shell_command")
    );
    let pattern = list.get(0).unwrap()["argsPattern"]
        .as_str()
        .unwrap()
        .to_string();
    // What JavaScript's RegExp finds (Gemini's), asked of node.
    let finds = |text: &str| {
        std::process::Command::new("node")
            .args([
                "-e",
                "process.exit(new RegExp(process.argv[1]).test(process.argv[2]) ? 0 : 1)",
                &pattern,
                text,
            ])
            .status()
            .unwrap()
            .success()
    };
    assert!(finds(r#"{"file_path":"C:\\x\\Privé.v1\\secret.txt"}"#));
    assert!(finds(r#"{"file_path":"C:/x//Privé.v1"}"#));
    assert!(!finds(r#"{"file_path":"C:\\x\\PrivéXv1"}"#));
    if cfg!(windows) {
        assert!(finds(r#"{"file_path":"c:\\X\\privé.V1"}"#));
    }
    // A discussion: its writes and commands refused.
    let ro = policy(&[], true).unwrap();
    assert!(
        ro.contains("write_file")
            && ro.contains("run_shell_command")
            && ro.contains("priority = 950")
    );
    let dir = crate::paths::test_dir("esc274-gemini-policy");
    let file = write_policy(&dir, Some(&rules)).unwrap().unwrap();
    assert_eq!(std::fs::read_to_string(&file).unwrap(), rules);
    assert_eq!(write_policy(&dir, None).unwrap(), None);
    assert!(!file.exists());
}

#[test]
fn the_agents_settings_are_written_in_its_own_home_keeping_what_gemini_wrote() {
    let dir = crate::paths::test_dir("esc274-gemini-settings");
    let file = dir.join(".gemini").join("settings.json");
    write_settings(&dir, "gemini-api-key").unwrap();
    let doc: Value = serde_json::from_str(&std::fs::read_to_string(&file).unwrap()).unwrap();
    assert_eq!(doc["general"]["enableAutoUpdate"], false);
    assert_eq!(doc["privacy"]["usageStatisticsEnabled"], false);
    assert_eq!(doc["security"]["auth"]["selectedType"], "gemini-api-key");
    // What Gemini wrote (its sign-in chosen, a setting of its own) is kept.
    std::fs::write(
        &file,
        r#"{"security":{"auth":{"selectedType":"oauth-personal"}},"ui":{"theme":"x"}}"#,
    )
    .unwrap();
    write_settings(&dir, "gemini-api-key").unwrap();
    let doc: Value = serde_json::from_str(&std::fs::read_to_string(&file).unwrap()).unwrap();
    assert_eq!(doc["security"]["auth"]["selectedType"], "oauth-personal");
    assert_eq!(doc["ui"]["theme"], "x");
    assert_eq!(doc["general"]["enableAutoUpdateNotification"], false);
    // How it signs in, by the variables given.
    let env = |k: &str, v: &str| vec![(k.to_string(), v.to_string())];
    assert_eq!(
        auth_type(&env("GOOGLE_GENAI_USE_VERTEXAI", "true")),
        "vertex-ai"
    );
    assert_eq!(auth_type(&env("GEMINI_API_KEY", "k")), "gemini-api-key");
}

#[test]
fn escouades_server_goes_by_the_session_never_the_command_line() {
    let granted = GEMINI.escouade_launch(&Escouade::Granted {
        url: "http://127.0.0.1:1/mcp".into(),
        token: "s3cr3t".into(),
        file: None,
    });
    assert!(granted.args.is_empty() && granted.env.is_empty());
    assert!(GEMINI.grant_file("http://x", "s3cr3t").is_none());
    assert_eq!(GEMINI.agent_home_var(), Some("GEMINI_CLI_HOME"));
    // Neither `fs` nor `terminal`: Gemini reads and writes by itself.
    assert_eq!(hello()["clientCapabilities"]["terminal"], false);
    assert_eq!(
        plan_file("Requesting plan approval for: C:\\p\\plan.md"),
        Some("C:\\p\\plan.md")
    );
    assert!(is_plan_exit("exit_plan_mode__exit_plan_mode_1_0"));
}

#[test]
fn a_message_takes_its_images_and_text_files_and_refuses_a_pdf() {
    let file = |name: &str, media: &str, data: &str| Attachment {
        name: name.into(),
        media_type: media.into(),
        data: data.into(),
    };
    let m = message(
        "Regarde",
        &[
            file("a.png", "image/png", "iVBORw0KGgo="),
            file("notes.txt", "text/plain", "bonjour"),
        ],
    )
    .unwrap();
    assert_eq!(m["prompt"].as_array().unwrap().len(), 3);
    assert!(message("x", &[file("a.pdf", "application/pdf", "JVBERi0=")]).is_err());
}
