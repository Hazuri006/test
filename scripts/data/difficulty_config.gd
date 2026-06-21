class_name DifficultyConfig
extends Resource
## A difficulty preset. Authored as .tres files under res://data/difficulty.

@export var id: String = "normal"
@export var display_name: String = "Normal"
@export_multiline var description: String = ""
## Scales monster aggression, speed bonuses and detection.
@export var monster_aggression_mult: float = 1.0
@export var detection_speed_mult: float = 1.0
## Multiplies flashlight battery drain.
@export var battery_drain_mult: float = 1.0
## Multiplies damage taken by the player.
@export var player_damage_mult: float = 1.0
## Whether the on-screen detection indicator is available.
@export var show_detection_indicator: bool = true
## Whether objective marker hints are shown.
@export var show_objective_hints: bool = true
## Starting flashlight charge (0-1).
@export var starting_battery: float = 1.0
