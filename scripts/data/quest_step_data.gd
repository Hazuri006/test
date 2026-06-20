class_name QuestStepData
extends Resource
## A single objective inside a quest.

@export var id: String = ""
@export_multiline var description: String = ""
## Optional objectives are tracked but not required to advance the main quest.
@export var optional: bool = false
## Hidden steps are not shown in the journal until they become the active step
## (used for spoiler-sensitive late objectives).
@export var hidden: bool = false
