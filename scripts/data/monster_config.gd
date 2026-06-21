class_name MonsterConfig
extends Resource
## Tuning values for The Hollow Attendant. Authored as a .tres and loaded by the
## Monster scene so behaviour can be balanced without touching code.

@export_group("Movement")
@export var patrol_speed: float = 1.4
@export var search_speed: float = 2.0
@export var stalk_speed: float = 1.8
@export var chase_speed: float = 3.5
@export var turn_speed: float = 6.0

@export_group("Vision")
@export var vision_range: float = 16.0
@export var vision_angle_deg: float = 65.0
## Within this radius the monster notices the player even outside the cone.
@export var vision_close_range: float = 2.5
@export var eye_height: float = 1.7

@export_group("Hearing")
@export var hearing_range: float = 18.0
## Multiplies incoming noise loudness; >1 makes the monster sharper-eared.
@export var hearing_sensitivity: float = 1.0

@export_group("Detection")
## Detection meter fills toward 1.0 while the player is sensed and decays otherwise.
@export var detection_gain_rate: float = 1.1
@export var detection_decay_rate: float = 0.45
## Meter level that escalates suspicion into a full chase.
@export var chase_threshold: float = 1.0
@export var suspicion_threshold: float = 0.45

@export_group("Combat")
@export var attack_range: float = 1.9
@export var attack_damage: float = 100.0
@export var attack_windup: float = 0.55
@export var attack_cooldown: float = 1.5

@export_group("Behaviour")
## Seconds with no fresh evidence before the monster abandons a chase.
@export var chase_give_up_time: float = 7.0
## Seconds spent searching a last-known position before returning to patrol.
@export var search_duration: float = 12.0
@export var can_open_doors: bool = true
## Probability (0-1) the monster opens a closed locker while searching.
@export var locker_check_chance: float = 0.5
## Base aggression multiplier; raised by quest progression at runtime.
@export var base_aggression: float = 1.0
## If > 0, the monster instantly chases when the player comes within this radius,
## regardless of the vision cone ("it hunts you if you get close"). 0 = disabled.
@export var proximity_aggro_range: float = 0.0
