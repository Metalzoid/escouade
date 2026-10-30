---
number: 9
title: "Un numéro de décision n'est donné qu'à son acceptation"
date: "2026-10-30"
state: "accepted"
origin: "ticket"
origin_ref: "ESC-303"
pages: ["docs/decisions","docs/planifier","docs/specification"]
tickets: ["ESC-303"]
documents: []
supersedes: []
superseded_by: null
changes: [{"page":"docs/decisions","added":16,"removed":10},{"page":"docs/planifier","added":4,"removed":3},{"page":"docs/specification","added":3,"removed":3}]
accepted_at: "2026-10-30T05:28:32+01:00"
accepted_by: "Guillaume Gagnaire"
---

## Contexte

Les agents de tickets menés en même temps proposaient chacun une décision sous le numéro qui suivait le registre de leur worktree : IDX-1 et STORE-8 ont eu la 1, STORE-12 et ESC-300 la 2, PLG-10 et ESC-302 la 4. Le chef d'escouade a renuméroté à la main à la fusion (e2358940, 4ea19200, face08a8), et la validation d'ESC-302 a accepté la 4 d'ESC-300 au lieu de la sienne, puis commité la sienne sous un deuxième 0004, restée proposée (32c0a0f1, corrigée en 0007).

## Décision

Une décision proposée n'a pas de numéro : elle a un id, le slug de son titre rendu unique dans le registre, et son fichier est <id>.md. Elle se cite par cet id (pages de spec, tickets, ce qui est à planifier, outils). Elle reçoit son numéro à l'acceptation : le plus haut du registre de la branche où elle va, plus un (main tel que git l'a au moment de la validation du ticket, et le dossier du projet ; la branche fixe des docs s'il y en a une). Son fichier devient NNNN-<id>.md, et les pages, les tickets et ce qui est à planifier qui la citaient par son id prennent le numéro ; une décision qu'elle remplace dit par quel numéro. La validation d'un ticket retrouve ses propositions par leur id (origine ticket, sa clé), jamais par un numéro. Les décisions déjà numérotées restent telles quelles ; une proposition numérotée avant garde son numéro tant qu'aucune autre ne l'a, ici ni sur main, sinon prend le suivant.

## Conséquences

Deux tickets parallèles validés de suite reçoivent deux numéros distincts, sans renumérotation à la main. Les références d'une page ou d'un ticket mêlent numéros et ids ([3, "tarif-famille"]) ; read_decision et propose_decision prennent un id ; list_decisions donne number (null pour une proposition) et id ; l'événement decision.proposed porte l'id au lieu du numéro. Deux validations en même temps vers deux branches différentes ne se voient pas.
