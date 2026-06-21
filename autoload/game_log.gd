extends Node
## Lightweight logging singleton. Routes engine output through one place so debug
## spam can be silenced in release builds. Registered as the `Logger` autoload.

## When false, debug() calls are dropped. Toggled on by the developer overlay.
var debug_enabled: bool = false

func _ready() -> void:
	# Debug logging follows the engine's debug build flag by default.
	debug_enabled = OS.is_debug_build()

func info(message: String) -> void:
	print("[INFO] ", message)

func debug(message: String) -> void:
	if debug_enabled:
		print("[DEBUG] ", message)

func warn(message: String) -> void:
	push_warning(message)
	print("[WARN] ", message)

func error(message: String) -> void:
	push_error(message)
	printerr("[ERROR] ", message)
