extends Node
## Smoke test -- boots the real game world and exercises every major system.
##
## Run it headless from the project root:
##     godot --headless --path . res://tests/smoke_test.tscn
##
## It prints a PASS/FAIL line per system and exits with code 1 if anything
## failed, so it can be dropped straight into CI. It is NOT part of the game:
## the main scene is still the menu.

const WORLD_SCENE := "res://scenes/world/game_world.tscn"

var world: Node3D
var results: Array[String] = []
var failures: int = 0

func _ready() -> void:
	await _run()

func _check(label: String, condition: bool, detail: String = "") -> void:
	var status := "PASS" if condition else "FAIL"
	if not condition:
		failures += 1
	var line := "[%s] %s" % [status, label]
	if detail != "":
		line += "  (%s)" % detail
	results.append(line)
	print(line)

func _frames(count: int) -> void:
	for i in count:
		await get_tree().physics_frame

func _run() -> void:
	print("=== BRICK CITY HERO -- SMOKE TEST ===")

	# --- boot the world -----------------------------------------------------
	var scene := load(WORLD_SCENE) as PackedScene
	_check("world scene loads", scene != null)
	if scene == null:
		_finish()
		return
	world = scene.instantiate() as Node3D
	world.set("show_loading", false)
	add_child(world)

	# Generation is asynchronous; wait for the player to appear.
	var waited: float = 0.0
	while GameState.get_player() == null and waited < 60.0:
		await get_tree().process_frame
		waited += get_process_delta_time()
	_check("city generated + hero spawned", GameState.get_player() != null,
			"%.1f s" % waited)
	if GameState.get_player() == null:
		_finish()
		return

	var player := GameState.get_player() as CharacterBody3D
	var city: Node3D = GameState.city
	await _frames(30)

	# --- city ---------------------------------------------------------------
	_check("city blocks built", city != null and (city.get("blocks") as Dictionary).size() >= 50,
			"%d blocks" % (city.get("blocks") as Dictionary).size())
	_check("bank landmark placed", not (city.get("bank") as Dictionary).is_empty())
	_check("factory landmark placed", not (city.get("factory") as Dictionary).is_empty())
	_check("navigation region built", city.get("navigation_region") != null)
	var traffic: Node = city.get("traffic")
	_check("traffic running", traffic != null and (traffic.get("vehicles") as Array).size() > 0,
			"%d vehicles" % (traffic.get("vehicles") as Array).size() if traffic != null else "none")

	# --- camera -------------------------------------------------------------
	var rig: Node3D = player.get_node_or_null("CameraRig")
	var camera: Camera3D = rig.get_node_or_null("Yaw/Pitch/SpringArm3D/ShakeRoot/Camera3D") if rig != null else null
	_check("third person camera active", camera != null and camera.current)

	# --- the hero stands on the ground --------------------------------------
	await _frames(60)
	_check("hero rests on the ground", player.is_on_floor(),
			"y=%.2f" % player.global_position.y)

	# --- movement -----------------------------------------------------------
	var start := player.global_position
	Input.action_press("move_forward")
	await _frames(45)
	Input.action_release("move_forward")
	var travelled: float = start.distance_to(player.global_position)
	_check("hero walks on input", travelled > 2.0, "%.1f m" % travelled)

	# --- jump ---------------------------------------------------------------
	var floor_y := player.global_position.y
	player.call("request_jump")
	await _frames(12)
	_check("hero jumps", player.global_position.y > floor_y + 0.8,
			"+%.2f m" % (player.global_position.y - floor_y))

	# --- double jump --------------------------------------------------------
	player.call("request_jump")
	await _frames(6)
	_check("double jump reached", int(player.get("state")) == 3,
			"state %d" % int(player.get("state")))
	await _frames(120)

	# --- animation tree -----------------------------------------------------
	var visual: Node3D = player.get_node_or_null("Visual")
	var tree: AnimationTree = visual.get_node_or_null("AnimationTree") if visual != null else null
	var anim_player: AnimationPlayer = visual.get_node_or_null("AnimationPlayer") if visual != null else null
	_check("animation player has clips",
			anim_player != null and anim_player.get_animation_list().size() >= 18,
			"%d clips" % (anim_player.get_animation_list().size() if anim_player != null else 0))
	_check("animation tree active", tree != null and tree.active)

	# --- web system ---------------------------------------------------------
	var web: Node3D = player.get_node_or_null("WebSystem")
	# Put the hero next to downtown and look up at the towers.
	player.global_position = CityLayout.intersection_center(4, 4) + Vector3(0, 14.0, 0)
	player.velocity = Vector3(0, 2.0, -12.0)
	await _frames(2)
	var attached := false
	for yaw in [0.0, 90.0, 180.0, 270.0, 45.0, 135.0, 225.0, 315.0]:
		rig.call("set_look", yaw, 32.0)
		await _frames(3)
		web.call("update_aim")
		if bool(web.get("aim_valid")):
			attached = bool(player.call("try_web_swing"))
			if attached:
				break
	_check("web anchor found + attached", attached)

	if attached:
		# Sample the whole arc: a pendulum is slowest at the top, so only the
		# peak speed tells us the rope is really driving the hero.
		var peak_speed: float = 0.0
		var max_stretch: float = 0.0
		var swung_frames: int = 0
		var worst_hand_gap: float = 0.0
		var worst_anchor_gap: float = 0.0
		var strand_seen: bool = false
		var strand: MeshInstance3D = web.get_node_or_null("Strand")
		var animator: Node3D = player.get_node_or_null("Visual")
		for i in 90:
			await get_tree().physics_frame
			if int(player.get("state")) == 6:      # State.SWING
				swung_frames += 1
				peak_speed = maxf(peak_speed, player.velocity.length())
				var stretch: float = player.global_position.distance_to(web.get("attach_point")) \
						- float(web.get("rope_length"))
				max_stretch = maxf(max_stretch, stretch)
				# The strand is a cylinder spanning hand -> anchor: check both ends
				# every frame, which is exactly what "the web is stuck to the hand"
				# means.
				if strand != null and strand.visible:
					strand_seen = true
					var half: Vector3 = strand.global_transform.basis.y * 0.5
					var hand: Node3D = animator.call("web_origin", true)
					worst_hand_gap = maxf(worst_hand_gap,
							(strand.global_position - half).distance_to(hand.global_position))
					worst_anchor_gap = maxf(worst_anchor_gap,
							(strand.global_position + half).distance_to(web.get("attach_point")))
		_check("swing physics moves the hero", peak_speed > 5.0,
				"peak %.1f m/s over %d frames" % [peak_speed, swung_frames])
		_check("rope constraint holds", max_stretch < 3.0,
				"max overshoot %.2f m" % max_stretch)

		_check("strand is drawn while swinging", strand_seen)
		_check("web strand stays on the hand", strand_seen and worst_hand_gap < 0.25,
				"worst %.3f m" % worst_hand_gap)
		_check("web strand stays on the anchor", strand_seen and worst_anchor_gap < 0.25,
				"worst %.3f m" % worst_anchor_gap)
		if bool(web.get("is_attached")):
			web.call("release", true)
		_check("web released cleanly", not bool(web.get("is_attached")))

	# --- facing -------------------------------------------------------------
	player.global_position = CityLayout.intersection_center(3, 3) + Vector3(0, 1.5, 0)
	player.velocity = Vector3.ZERO
	rig.call("set_look", 0.0, -10.0)
	await _frames(20)
	Input.action_press("move_forward")
	await _frames(40)
	var travel_dir: Vector3 = Vector3(player.velocity.x, 0.0, player.velocity.z).normalized()
	var facing: Vector3 = -player.global_transform.basis.z
	var facing_dot: float = facing.dot(travel_dir)
	Input.action_release("move_forward")
	_check("hero faces the way he runs", facing_dot > 0.85, "dot %.2f" % facing_dot)

	# Strafing right must move the hero to the camera's right, not its left.
	player.velocity = Vector3.ZERO
	await _frames(12)
	var before_strafe := player.global_position
	Input.action_press("move_right")
	await _frames(35)
	Input.action_release("move_right")
	var strafe: Vector3 = player.global_position - before_strafe
	var camera_right: Vector3 = rig.call("get_flat_right")
	var strafe_dot: float = strafe.normalized().dot(camera_right)
	_check("strafe keys are not mirrored", strafe_dot > 0.8, "dot %.2f" % strafe_dot)

	# --- zip line -----------------------------------------------------------
	var zipped := false
	for yaw in [0.0, 90.0, 180.0, 270.0]:
		rig.call("set_look", yaw, 25.0)
		await _frames(3)
		if bool(player.call("try_web_zip")):
			zipped = true
			break
	_check("zip line fires", zipped)
	web.call("end_zip", false)

	# --- combat -------------------------------------------------------------
	player.global_position = CityLayout.intersection_center(3, 3) + Vector3(0, 1.5, 0)
	player.velocity = Vector3.ZERO
	await _frames(20)
	var thug := EnemyFactory.spawn("thug", player.global_position - player.global_transform.basis.z * 1.6)
	_check("enemy spawns from the pool", thug != null)
	if thug != null:
		await _frames(10)
		var health_before: float = thug.health
		var combat: Node = player.get_node_or_null("Combat")
		combat.call("request_light")
		await _frames(45)
		_check("light attack damages an enemy", thug.health < health_before,
				"%.0f -> %.0f" % [health_before, thug.health])
		thug.take_damage(500.0, player.global_position, Vector3.UP * 4.0)
		await _frames(10)
		_check("enemy is defeated by damage", thug.is_defeated())

	# --- enemy AI -----------------------------------------------------------
	var hunter := EnemyFactory.spawn("runner", player.global_position + Vector3(12.0, 0.5, 0.0))
	if hunter != null:
		await _frames(90)
		_check("enemy chases the hero",
				hunter.global_position.distance_to(player.global_position) < 12.0,
				"%.1f m" % hunter.global_position.distance_to(player.global_position))
		ObjectPool.release(hunter)

	# --- web attack on an enemy --------------------------------------------
	player.velocity = Vector3.ZERO
	await _frames(30)          # let the turn lerp settle
	var webbed := EnemyFactory.spawn("thug", player.global_position - player.global_transform.basis.z * 4.0)
	if webbed != null:
		await _frames(10)
		var combat2: Node = player.get_node_or_null("Combat")
		combat2.call("request_web_attack")
		await _frames(40)
		_check("web attack webs an enemy", webbed.state == EnemyBase.State.WEBBED
				or webbed.health < webbed.max_health)
		ObjectPool.release(webbed)

	# --- projectiles --------------------------------------------------------
	var gunner := EnemyFactory.spawn("gunner", player.global_position + Vector3(14.0, 0.5, 0.0))
	if gunner != null:
		await _frames(180)
		_check("ranged enemy engages", gunner.state != EnemyBase.State.PATROL,
				EnemyBase.State.keys()[gunner.state])
		ObjectPool.release(gunner)

	# --- missions -----------------------------------------------------------
	var missions: Node = world.get_node_or_null("Missions")
	_check("missions registered", MissionManager.missions.size() >= 3,
			"%d missions" % MissionManager.missions.size())
	_check("tutorial is active", MissionManager.is_active("m01_tutorial"),
			MissionManager.active_id)

	MissionManager.complete("m01_tutorial")
	await _frames(10)
	_check("tutorial completes", MissionManager.is_completed("m01_tutorial"))

	missions.call("force_start", "m02_bank")
	await _frames(10)
	_check("bank heist starts", MissionManager.is_active("m02_bank"))
	# Teleport to the bank so the arrival cutscene fires.
	var bank_data: Dictionary = city.get("bank")
	player.global_position = (bank_data["plaza"] as Vector3) + Vector3(0, 2.0, 8.0)
	await _frames(240)
	_check("bank heist reached its fight phase",
			MissionManager.get_mission("m02_bank").current_index >= 1,
			"objective %d" % MissionManager.get_mission("m02_bank").current_index)
	MissionManager.complete("m02_bank")
	await _frames(10)

	# --- boss ---------------------------------------------------------------
	missions.call("force_start", "m03_mechanix")
	await _frames(10)
	_check("boss mission starts", MissionManager.is_active("m03_mechanix"))

	var boss_scene := load("res://scenes/bosses/mechanix.tscn") as PackedScene
	var boss := boss_scene.instantiate() as BossMechanix
	world.add_child(boss)
	var factory_data: Dictionary = city.get("factory")
	boss.global_position = factory_data["boss_spawn"]
	player.global_position = (factory_data["arena_center"] as Vector3) + Vector3(0, 3.0, 14.0)
	await _frames(20)
	boss.begin_fight(factory_data["arena_center"], 30.0)
	_check("boss has four arms", boss.arms.size() == 4)
	await _frames(240)
	_check("boss attacks", boss.stance == BossMechanix.Stance.FIGHT
			or boss.stance == BossMechanix.Stance.STAGGERED,
			BossMechanix.Stance.keys()[boss.stance])

	# Break an arm through its weak point, the way the player would.
	var arm: RoboticArm = boss.arms[0]
	for i in 20:
		arm.damage_weak_point(20.0, player.global_position)
	await _frames(10)
	_check("arm weak point can be destroyed", arm.broken)
	_check("boss loses health when an arm breaks", boss.health < boss.max_health,
			"%.0f / %.0f" % [boss.health, boss.max_health])

	# Drive to phase 3 and finish him.
	for i in 200:
		boss.damage_weak_point(20.0, player.global_position)
		if boss.is_defeated():
			break
	await _frames(30)
	_check("boss reaches phase 3", MissionManager.boss_phase_reached >= 3,
			"phase %d" % MissionManager.boss_phase_reached)
	_check("boss can be defeated", boss.is_defeated())

	# --- side activities ----------------------------------------------------
	var side: Node = missions.get("side")
	_check("side activities generated", side != null and int(side.call("active_count")) > 0,
			"%d active" % (int(side.call("active_count")) if side != null else 0))

	# --- damage + respawn ---------------------------------------------------
	player.call("take_damage", 30.0, player.global_position + Vector3(2, 0, 0))
	await _frames(5)
	_check("hero takes damage", float(player.call("get_health")) < 100.0,
			"%.0f hp" % float(player.call("get_health")))
	player.call("respawn_at", CityLayout.intersection_center(2, 2) + Vector3(0, 2, 0))
	await _frames(10)
	_check("hero respawns at full health", is_equal_approx(float(player.call("get_health")), 100.0))

	# --- save / load --------------------------------------------------------
	GameState.add_score(1234)
	var saved := SaveManager.save_game(9, true)
	_check("save written", saved and SaveManager.has_save(9))
	var loaded := SaveManager.queue_load(9)
	_check("save reloads", loaded and not GameState.pending_save_data.is_empty())
	SaveManager.apply_pending_save()
	_check("save restores the mission log", MissionManager.is_completed("m01_tutorial"))
	SaveManager.delete_save(9)

	# --- audio --------------------------------------------------------------
	AudioManager.play("punch")
	AudioManager.play_music("combat")
	await _frames(10)
	_check("audio buses exist", AudioServer.get_bus_index("Music") >= 0
			and AudioServer.get_bus_index("SFX") >= 0)

	# --- pooling ------------------------------------------------------------
	_check("object pools in use", ObjectPool.is_registered("enemy_thug")
			and ObjectPool.is_registered("impact_fx"))

	_finish()

func _finish() -> void:
	print("=== RESULT: %d checks, %d failure(s) ===" % [results.size(), failures])
	await get_tree().process_frame
	get_tree().quit(1 if failures > 0 else 0)
