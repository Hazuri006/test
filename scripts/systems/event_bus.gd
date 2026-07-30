extends Node
## EventBus (autoload name: Events)
##
## Central, decoupled signal hub. Any system can emit or listen without holding
## a direct reference to another system. Keeping every cross-system signal here
## means gameplay code never has to search the tree for siblings.
##
## Scene requirements: none (autoload, registered in project.godot).

# --- Player -------------------------------------------------------------------
signal player_spawned(player: Node3D)
signal player_health_changed(current: float, maximum: float)
signal player_died
signal player_landed(fall_speed: float)
signal player_state_changed(state_name: String)
signal player_speed_changed(speed: float)

# --- Web system ---------------------------------------------------------------
signal web_attached(point: Vector3)
signal web_released
signal web_target_available(available: bool)

# --- Combat -------------------------------------------------------------------
signal combo_changed(count: int, timer_ratio: float)
signal enemy_damaged(enemy: Node3D, amount: float)
signal enemy_defeated(enemy: Node3D)
signal camera_shake_requested(strength: float, duration: float)
signal hit_stop_requested(duration: float)

# --- Missions -----------------------------------------------------------------
signal mission_started(mission_id: String, title: String)
signal mission_objective_changed(text: String, index: int, total: int)
signal mission_completed(mission_id: String, reward: int)
signal mission_failed(mission_id: String)
signal mission_marker_changed(world_position: Vector3, visible: bool)
signal enemy_counter_changed(remaining: int)
signal dialogue_requested(speaker: String, line: String, duration: float)
signal toast_requested(text: String)

# --- Boss ---------------------------------------------------------------------
signal boss_intro_started(boss_name: String)
signal boss_health_changed(current: float, maximum: float, phase: int)
signal boss_defeated

# --- Meta / flow --------------------------------------------------------------
signal game_paused(paused: bool)
signal score_changed(score: int)
signal save_written(slot: int)
signal settings_applied
