class_name DocumentDatabase
extends RefCounted
## All readable documents in THE LAST WARD. Code is the source of truth; .tres
## DocumentData files under res://data/documents override matching ids.

static var _docs: Dictionary = {}
static var _initialised: bool = false

static func _ensure() -> void:
	if _initialised:
		return
	_initialised = true
	_build()
	_load_overrides()

static func _build() -> void:
	_add("doc_intro_letter", "Folded Note", "Unknown", "Received 3 days ago", "",
		"Elias —\n\nIf this reached you, then she did get a message out before the end. Saint Veyra was never a hospital. Not really.\n\nThe gate code is 1-9-8-6. Don't trust the lights. Don't trust the cameras.\n\nAnd whatever they tell you down there — do not let them open the lower ward.")

	_add("doc_electrical_map", "Electrical Map", "Maintenance Dept.", "Laminated", "",
		"SAINT VEYRA — EMERGENCY POWER SCHEMATIC\n\nGenerator (Sub-Level B) feeds two lines:\n  A-LINE → Reception, Corridors, Archive\n  B-LINE → Security, Morgue, Lower Ward lift\n\nBoth ceramic fuses (A and B) must be seated before the generator will turn over. Diesel reservoir holds 4 litres minimum to start.\n\nNOTE (handwritten): B-line keeps tripping. Something downstairs is drawing power that isn't on any drawing.")

	_add("doc_admission_log", "Admission Log Fragment", "Reception", "Final week", "",
		"...intake suspended by order of Dr. Voss. No new patients to be registered through the front desk. All 'Programme' admissions routed directly to the lower ward.\n\nThe families are still calling. We tell them their relatives are 'responding well to treatment.' Most of those patients I have not seen in weeks.")

	_add("doc_staff_warning", "Staff Bulletin", "Night Charge Nurse", "—", "",
		"To all night staff:\n\nDo NOT enter the east corridor alone after lights-out. If you hear the trolley wheels and you did not move a trolley, stand still. Switch off your torch. It follows light.\n\nManagement says it is faulty wiring and rats. Management does not work nights.")

	_add("doc_fire_report", "Incident Report", "County Fire Service", "Closure year", "",
		"Cause of fire: undetermined, originating Sub-Level B.\n\nThe blaze was contained to the lower levels yet six staff and eleven patients remain unaccounted for. No remains recovered. Structural engineers advise the underground section be sealed rather than excavated.\n\nThe site was condemned. The lower ward was never reopened.")

	_add("doc_security_memo", "Security Memo", "Head of Security", "—", "",
		"Lockdown procedure revised. The lower ward maglocks now require THREE access seals to release, held by separate staff. No single person can open it. That was Voss's instruction, and for once I agree with him.\n\nCamera 4 covers the archive corridor. If you ever see the keypad code written on the wall back there, do not say it aloud. Just enter it.")

	_add("doc_voss_journal", "Dr. Voss — Private Journal", "Dr. A. Voss", "Programme, day 211", "voss_journal",
		"They came to me ruined. Soldiers, survivors, a girl who watched her parents burn. Trauma is only a memory that refuses to be filed. My Procedure extracts the memory cleanly and stores it in the resonant lattice downstairs.\n\nThe patients wake calm. Empty, the nurses say. Calm, I say.\n\nBut the lattice is no longer merely storing. The extracted fear has begun to... cohere. It wears the shape of the one who tended them. It wears whites. It wears a face that is almost a face.")

	_add("doc_experiment_log", "Procedure Log B-17", "Programme Staff", "—", "experiment_log",
		"Subject responses after extraction: flat affect, loss of identifying memory, intact motor function.\n\nMass anomaly in containment lattice now exceeds the sum of extracted material. It is generating. Each new extraction feeds it. It has learned the floor plan. It has learned our footsteps.\n\nRecommendation (ignored by Director): cease extraction. Sever power to the lattice. Do not, under any circumstances, perform the final combined extraction.")

	_add("doc_ritual_notes", "Containment Notes", "Programme Staff", "—", "ritual_notes",
		"If severing power only releases it, and feeding it only grows it, there remains a third path: containment.\n\nThe lattice answers to three symbols etched on the chamber door — the eye (watching), the spiral (memory), the broken circle (the self undone). Set them in the order the patients were taken: watched, remembered, undone.\n\nDone correctly, the lattice folds inward and seals. The one who performs it must remain on the inside. There is no version of this where the door opens again.")

	_add("doc_patient_intake", "Patient Intake — L. Morel", "Admissions", "Three years ago", "patient_intake",
		"NAME: Morel, Lena\nADMISSION: voluntary (investigative — see security flag)\nFILE NO.: see archive\n\nNOTES: Subject is not a patient. Subject gained access claiming to be press, then refused to leave the lower levels. Dr. Voss has authorised her enrolment in the Programme 'to resolve her curiosity.'\n\nHANDWRITTEN: She knew my name. She knew about the lattice before I told her. God forgive me, I signed the form.")

	_add("doc_calendar", "Ward Calendar", "Archive", "—", "",
		"A grime-darkened wall calendar. Four dates are circled hard enough to tear the paper, each beside a patient number:\n\n  Patient 1 — the 9th\n  Patient 9 — the 8th\n  Patient 8 — the 6th\n  Patient 6 — the... (the last digit is smudged, but the sequence of circled days reads 9, 8, 6, 1)\n\nBeneath, in the same furious hand: 'In the order they were taken.'")

	_add("doc_final_note", "Lena's Note", "Lena Morel", "—", "lena_here",
		"Eli —\n\nIf you're reading my handwriting then you came after me, which means you never could take a warning.\n\nVoss is dead. The thing in the lattice killed him with his own hands. It has my fear now — all of it, the night of the fire, you on the doorstep, everything. When it looks at me it almost remembers being me.\n\nThere's a coil in the lab. A containment device. You know which choice I'd make. I never could leave a door closed either.")

static func _add(id: String, title: String, author: String, date: String, evidence: String, body: String) -> void:
	var doc: DocumentData = DocumentData.new()
	doc.id = id
	doc.title = title
	doc.author = author
	doc.date = date
	doc.body = body
	doc.evidence_id = evidence
	_docs[id] = doc

static func _load_overrides() -> void:
	var dir: DirAccess = DirAccess.open("res://data/documents")
	if dir == null:
		return
	dir.list_dir_begin()
	var f: String = dir.get_next()
	while f != "":
		if f.ends_with(".tres") or f.ends_with(".res"):
			var res: Resource = ResourceLoader.load("res://data/documents/" + f)
			if res is DocumentData and (res as DocumentData).id != "":
				_docs[(res as DocumentData).id] = res
		f = dir.get_next()
	dir.list_dir_end()

static func get_doc(id: String) -> DocumentData:
	_ensure()
	return _docs.get(id, null) as DocumentData

static func has(id: String) -> bool:
	_ensure()
	return _docs.has(id)
