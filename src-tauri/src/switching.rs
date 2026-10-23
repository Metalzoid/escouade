//! « Changer de compte à » (ESC-148): an agent whose account has a quota meter past the threshold
//! goes on, at the end of its turn, on another usable account of its harness (its session with
//! it, as « Reprendre sur <compte> » moves it), never in the middle of a turn, nor while a question
//! waits for the user or something runs in the background in its process.

use crate::accounts;
use crate::agent::{AgentAlert, NotifyKind};
use crate::board;
use crate::core::Core;
use crate::i18n::{self, Lang};
use crate::model::*;
use crate::usage::window_name;
use std::sync::Arc;
use tauri::Runtime;

/// Why an agent past the threshold has no other account to go on on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum NoOther {
    /// None of its harness serving its project is usable (under the threshold, signed in, held
    /// back by nothing).
    Nobody,
    /// Its project is private and confined (ESC-141): the usable ones are accounts it shares.
    Private,
    /// Its ticket is set on its account (« Compte », ESC-153): it stays there.
    Pinned,
}

/// The meter of the account that went the furthest past `threshold` at `now`, if one did.
pub(crate) fn furthest(
    usage: &[AccountUsage],
    id: &str,
    threshold: u32,
    now: i64,
) -> Option<QuotaMeter> {
    accounts::meters_over(usage, id, threshold, now)
        .into_iter()
        .reduce(|a, b| if b.pct > a.pct { b } else { a })
}

/// The meter as a sentence says what of it is used: « sa fenêtre de 5 h », « its weekly window »,
/// « ses crédits du mois ».
fn meter_phrase(lang: Lang, meter: &QuotaMeter) -> String {
    match meter.minutes {
        Some(m) => {
            let window = window_name(lang, m);
            tr_in!(lang, "sa fenêtre {window}", "its {window} window")
        }
        None => tr_in!(lang, "ses crédits du mois", "its month’s credits"),
    }
}

/// What the conversation says when the agent goes on on `to`, leaving `from` at `meter`.
pub(crate) fn switched_line(lang: Lang, to: &str, from: &str, meter: &QuotaMeter) -> String {
    let (pct, what) = (meter.pct.round(), meter_phrase(lang, meter));
    tr_in!(
        lang,
        "L’agent passe sur le compte {to} : {from} est à {pct} % de {what}.",
        "The agent goes on on the {to} account: {from} is at {pct}% of {what}."
    )
}

/// What the notification says of the agent that went on on `to`.
pub(crate) fn switched_toast(
    lang: Lang,
    agent: &str,
    to: &str,
    from: &str,
    meter: &QuotaMeter,
) -> String {
    let (pct, what) = (meter.pct.round(), meter_phrase(lang, meter));
    tr_in!(
        lang,
        "{agent} passe sur {to} : {from} à {pct} % de {what}.",
        "{agent} goes on on {to}: {from} at {pct}% of {what}."
    )
}

/// What the conversation says when the agent stays on `from`, past the threshold at `meter`, with
/// no account to go on on (`why`); `overage`: the account answers as extra usage, billed apart.
pub(crate) fn stays_line(
    lang: Lang,
    from: &str,
    harness: &str,
    meter: &QuotaMeter,
    why: NoOther,
    overage: bool,
) -> String {
    let (pct, what) = (meter.pct.round(), meter_phrase(lang, meter));
    let line = match why {
        NoOther::Nobody => tr_in!(
            lang,
            "{from} est à {pct} % de {what}, mais aucun autre compte {harness} ne peut prendre l’agent (sous le seuil, connecté, servant ce projet) : il y reste.",
            "{from} is at {pct}% of {what}, but no other {harness} account can take the agent (under the threshold, signed in, serving this project): it stays there."
        ),
        NoOther::Private => tr_in!(
            lang,
            "{from} est à {pct} % de {what}, mais ce projet privé ne passe pas tout seul sur un compte qu’il partage : l’agent y reste.",
            "{from} is at {pct}% of {what}, but this private project doesn’t go on its own to an account it shares: the agent stays there."
        ),
        NoOther::Pinned => tr_in!(
            lang,
            "{from} est à {pct} % de {what}, mais le ticket de l’agent est fixé sur ce compte : il y reste.",
            "{from} is at {pct}% of {what}, but the agent’s ticket is set on this account: it stays there."
        ),
    };
    if !overage {
        return line;
    }
    let billed = tr_in!(
        lang,
        "Ce compte est en usage supplémentaire, facturé à part.",
        "This account is in extra usage, billed separately."
    );
    format!("{line} {billed}")
}

/// While it lives, the agent is being looked at for a switch: another look waits for none.
struct Switching<'a, R: Runtime>(&'a Core<R>, String);

impl<R: Runtime> Drop for Switching<'_, R> {
    fn drop(&mut self) {
        self.0.switching.lock().remove(&self.1);
    }
}

impl<R: Runtime> Core<R> {
    /// `switch_if_over`, in the background: a reading of the quota of the agent's account just came.
    pub(crate) fn switch_soon(self: &Arc<Self>, id: &str) {
        let (c, id) = (self.clone(), id.to_string());
        tauri::async_runtime::spawn(async move {
            c.switch_if_over(&id).await;
        });
    }

    /// The agent goes on on another account of its harness when its own has a meter past « Changer
    /// de compte à » and it is free: its turn over, no question or permission waiting for the user,
    /// nothing running in the background in its process, no reset of a usage limit waited for (the
    /// move at the limit is `switch_on_limit`'s). The account it goes to is under the threshold
    /// itself (`other_account`, `board::pick_threshold`), so that it never goes back and forth: it
    /// leaves that one only once that one passes it too, and the first is a choice again once
    /// reset. With none, it stays, and its conversation says why, once for that account. True when
    /// it moved.
    pub(crate) async fn switch_if_over(self: &Arc<Self>, id: &str) -> bool {
        let settings = self.settings.read().clone();
        let threshold = board::switch_threshold(&settings);
        // « À la limite »: nothing moves before it.
        if threshold >= 100 {
            return false;
        }
        if !self.switching.lock().insert(id.to_string()) {
            return false;
        }
        let _looking = Switching(self, id.to_string());
        let Ok(h) = self.agent(id) else { return false };
        let account = {
            let rt = h.lock();
            // A harness whose sessions go from an account to another (Claude Code alone today).
            let moves = crate::engine::by_id(rt.meta.engine)
                .caps()
                .resume_other_account;
            let free = moves
                && !rt.meta.archived
                // The Claude Code view's process is its interface: not moved under the user.
                && !rt.meta.terminal
                && !rt.meta.status.is_active()
                && rt.meta.resume_at.is_none()
                && rt.meta.session_id.is_some()
                && rt.waiting_views().next().is_none()
                && !rt
                    .meta
                    .plan
                    .as_ref()
                    .is_some_and(|p| p.holds_process(crate::model::now_ms()));
            if !free {
                return false;
            }
            accounts::get(&settings, &rt.meta.account)
        };
        let usage = self.usage.lock().accounts.clone();
        let Some(meter) = furthest(&usage, &account.id, threshold, self.pause_now()) else {
            self.switch_told.lock().remove(id);
            return false;
        };
        let lang = i18n::ui();
        let from = accounts::name_in(lang, &account);
        let target = match self.other_account(id, board::pick_threshold(&settings)) {
            Ok(target) => target,
            Err(why) => {
                // Said once while the agent stays on that account.
                let told = self
                    .switch_told
                    .lock()
                    .insert(id.to_string(), account.id.clone());
                if told.as_deref() != Some(account.id.as_str()) {
                    let overage = usage.iter().any(|u| u.id == account.id && u.overage);
                    let harness = crate::engine::by_id(account.engine).name();
                    let text = stays_line(lang, &from, harness, &meter, why, overage);
                    log::info!(
                        "agent {id}: stays on the account {} past the threshold",
                        account.id
                    );
                    let _ = self.with_agent(id, |rt, fx| {
                        rt.notice("warn", text, fx);
                        Ok(())
                    });
                }
                return false;
            }
        };
        if let Err(e) = self.move_session(id, &target).await {
            // Its turn begun meanwhile, its process gone: the next end of a turn looks again.
            log::warn!("agent {id}: no move to the account {target} past the threshold: {e:#}");
            return false;
        }
        self.switch_told.lock().remove(id);
        let to = accounts::name_in(lang, &accounts::get(&self.settings.read(), &target));
        log::info!(
            "agent {id}: from the account {} to {target}, past the threshold",
            account.id
        );
        let line = switched_line(lang, &to, &from, &meter);
        let (name, project) = match self.with_agent(id, |rt, fx| {
            rt.notice("info", line, fx);
            Ok((rt.meta.name.clone(), rt.meta.project_id.clone()))
        }) {
            Ok(x) => x,
            Err(_) => return true,
        };
        self.hub.emit(UiEvent::Toast {
            text: switched_toast(lang, &name, &to, &from, &meter),
        });
        let alert = AgentAlert {
            kind: NotifyKind::Done,
            body: switched_line(lang, &to, &from, &meter),
        };
        self.notify_agent(alert, &project, id, &name);
        // Its process started again on the new account: the card shows the account it runs on.
        self.warm(id);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::i18n::Lang::{En, Fr};

    fn meter(minutes: Option<u32>, pct: f64) -> QuotaMeter {
        QuotaMeter {
            minutes,
            pct,
            resets_at: Some(2_000_000),
        }
    }

    #[test]
    fn the_switch_is_said_with_the_window_that_went_the_furthest() {
        let five = meter(Some(300), 95.4);
        assert_eq!(
            switched_line(Fr, "Pro", "Principal", &five),
            "L’agent passe sur le compte Pro : Principal est à 95 % de sa fenêtre de 5 h."
        );
        assert_eq!(
            switched_line(En, "Pro", "Main", &meter(Some(WEEK), 96.0)),
            "The agent goes on on the Pro account: Main is at 96% of its weekly window."
        );
        assert_eq!(
            switched_toast(Fr, "Revue", "Pro", "Principal", &five),
            "Revue passe sur Pro : Principal à 95 % de sa fenêtre de 5 h."
        );
        assert_eq!(
            switched_line(Fr, "B", "A", &meter(None, 90.0)),
            "L’agent passe sur le compte B : A est à 90 % de ses crédits du mois."
        );
        // The one used the most of those past the threshold.
        let usage = [AccountUsage {
            id: "a".into(),
            meters: vec![meter(Some(300), 91.0), meter(Some(WEEK), 97.0)],
            ..Default::default()
        }];
        assert_eq!(furthest(&usage, "a", 90, 0).map(|m| m.pct), Some(97.0));
        assert_eq!(furthest(&usage, "a", 98, 0), None);
        assert_eq!(furthest(&usage, "b", 10, 0), None);
    }

    #[test]
    fn staying_says_why_and_that_extra_usage_is_billed_apart() {
        let five = meter(Some(300), 96.0);
        assert_eq!(
            stays_line(Fr, "Principal", "Claude Code", &five, NoOther::Nobody, false),
            "Principal est à 96 % de sa fenêtre de 5 h, mais aucun autre compte Claude Code ne peut prendre l’agent (sous le seuil, connecté, servant ce projet) : il y reste."
        );
        assert_eq!(
            stays_line(En, "Main", "Claude Code", &five, NoOther::Private, true),
            "Main is at 96% of its 5-hour window, but this private project doesn’t go on its own to an account it shares: the agent stays there. This account is in extra usage, billed separately."
        );
    }
}
