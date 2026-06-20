class_name DocumentData
extends Resource
## A readable in-world document (report, note, letter) shown in the document reader.

@export var id: String = ""
@export var title: String = "Untitled Document"
@export var author: String = ""
@export var date: String = ""
@export_multiline var body: String = ""
## Optional evidence id this document records when first read (for endings).
@export var evidence_id: String = ""
