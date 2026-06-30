Spell = {}
Spell.__index = Spell

local function NormalizeSpellCategory(category)
    if not category or category == "" then return "Autre" end
    if category == "Clan" or category == "Hériditaire" or category == "Epée" or category == "Autre" then
        return category
    end
    return "Autre"
end

function Spell:new(data)
    local instance = setmetatable({}, self)

    instance.id          = data.id          or "unknown"
    instance.name        = data.name        or "Sort inconnu"
    instance.desc        = data.desc        or ""
    instance.clan        = data.clan        or "none"
    instance.category    = NormalizeSpellCategory(data.category)
    instance.type        = data.type        or "projectile"  -- "projectile" | "aoe" | "melee" | "buff"
    instance.damage      = data.damage      or 0
    instance.cost        = data.cost        or 0
    instance.cooldown    = data.cooldown    or 1
    instance.rang       = data.rang       or "D"
    instance.range       = data.range       or 500
    instance.maxLevel    = tonumber(data.maxLevel or data.max_level) or 3
    instance.levels      = data.levels or {}

    instance.svgIcon     = data.svgIcon     or nil
    instance.iconUrl     = data.iconUrl     or data.icon_url or data.img or data.image or data.icon or nil
    instance.requiere    = data.client_requiere

    instance._cast       = data.Cast
    instance._clientCast = data.ClientCast
    instance._onHit      = data.OnHit

    return instance
end

function Spell:CanCast(caster)
    local energy = caster:GetValue("energy") or 0
    return energy >= self.cost
end

function Spell:Cast(caster, data)
    if self._cast then
        self._cast(self, caster, data)
    end
end

function Spell:OnHit(caster, victim)
    if self._onHit then
        self._onHit(self, caster, victim)
    end
end

function Spell:ToTable(levelOverride)
    return {
        id       = self.id,
        name     = self.name,
        desc     = self.desc,
        clan     = self.clan,
        category = self.category,
        type     = self.type,
        damage   = self.damage,
        cost     = self.cost,
        cooldown = self.cooldown,
        range    = self.range,
        svgIcon  = self.svgIcon,
        iconUrl  = self.iconUrl,
        level    = tonumber(levelOverride) or 1,
        maxLevel = self.maxLevel,
    }
end


SpellRegistry = {}
SpellRegistry._spells = {}

function SpellRegistry.Register(data)
    local spell = Spell:new(data)
    SpellRegistry._spells[spell.id] = spell
    return spell
end

function SpellRegistry.Get(id)
    return SpellRegistry._spells[id]
end

function SpellRegistry.GetByClan(clan)
    local result = {}
    for _, spell in pairs(SpellRegistry._spells) do
        if spell.clan == clan then
            result[#result + 1] = spell
        end
    end
    return result
end

function SpellRegistry.All()
    local result = {}
    for id, spell in pairs(SpellRegistry._spells) do
        result[id] = spell:ToTable()
    end
    return result
end

SpellRegistry.Register({
    id       = "eclaire_bleu",
    name     = "Éclaire bleu",
    desc     = "Ralentit tout projectile ou attaque qui approche.",
    clan     = "gojo",
    category = "Hériditaire",
    type     = "buff",
    damage   = 0,
    cost     = 20,
    cooldown = 1,
    rang = "C",
    range    = 2000,
    iconUrl  = "https://i.imgur.com/fYhbRv8.jpeg",

    client_requiere = {
        "Trace.LineSingle"
    },

    ClientCast = function(self, char, player, _)
        local loc = nil
        pcall(function() loc = char:GetLocation() end)
        if not loc then return nil end

        local rot = nil
        pcall(function() rot = player:GetCameraRotation() end)
        if not rot then return nil end

        local TRACE_DIST  = self.range
        local GROUND_DROP = 50000
        local startPt = loc + Vector(0, 0, 60)
        local forward = rot:GetForwardVector()
        local endPt   = startPt + forward * TRACE_DIST

        local collisionCh = CollisionChannel.WorldStatic | CollisionChannel.WorldDynamic | CollisionChannel.PhysicsBody
        local traceMode   = (TraceMode and TraceMode.TraceComplex) or 0

        local hitPos = nil
        pcall(function()
            local tr = Trace.LineSingle(startPt, endPt, collisionCh, traceMode, { char })
            if tr and tr.Success then
                hitPos = tr.Location or tr.ImpactPoint
            end
        end)

        if not hitPos then
            local groundPt = Vector(endPt.X, endPt.Y, endPt.Z)
            pcall(function()
                local tr = Trace.LineSingle(groundPt, groundPt + Vector(0, 0, -GROUND_DROP), collisionCh, traceMode, { char })
                if tr and tr.Success then
                    hitPos = tr.Location or tr.ImpactPoint
                end
            end)
            if not hitPos then
                hitPos = Vector(endPt.X, endPt.Y, endPt.Z - GROUND_DROP)
            end
        end

        return {
            hitX = hitPos.X,
            hitY = hitPos.Y,
            hitZ = hitPos.Z,
        }
    end,

    OnHit = function (sp, caster, victim)
        victim:SetHealth(0)
    end,

    Cast = function(sp, caster, data)
        local char = GetValidChar(caster)
        if not char then return end

        local hitX = (data and data.hitX) or 0
        local hitY = (data and data.hitY) or 0
        local hitZ = (data and data.hitZ) or 0
        local particle = Particle(Vector(hitX, hitY, hitZ+950), Rotator(0, 0, 0), "stylizedlight::NS_LightningStrikeLoop04", false, true)
        local hitBox = Trigger(Vector(hitX, hitY, hitZ), Rotator(), 200, TriggerType.Box, true, Color.RED, {'Character'})
        hitBox:Subscribe("BeginOverlap", function (self, entity)
            sp:OnHit(caster, entity)
        end)
    end,
})

SpellRegistry.Register({
    id       = "test2",
    name     = "Test 2",
    desc     = "Lance une animation puis envoie une tornade droit devant.",
    clan     = "test",
    category = "Test",
    type     = "attack",
    damage   = 25,
    cost     = 10,
    cooldown = 1,
    rang     = "C",
    range    = 1200,
    iconUrl  = "https://i.imgur.com/fYhbRv8.jpeg",

    client_requiere = {
        "Trace.LineSingle"
    },

    ClientCast = function(self, char, player, _)
        local rot = nil

        pcall(function()
            rot = player:GetCameraRotation()
        end)

        if not rot then
            return nil
        end

        local forward = rot:GetForwardVector()

        return {
            dirX = forward.X,
            dirY = forward.Y,
            dirZ = forward.Z,
        }
    end,

    OnHit = function(sp, caster, victim)
        if not victim then return end

        local casterChar = GetValidChar(caster)
        if casterChar and victim == casterChar then return end

        Console.Log("Test2 touche une cible")

        pcall(function()
            victim:ApplyDamage(sp.damage)
        end)
    end,

    Cast = function(sp, caster, data)
        local char = GetValidChar(caster)
        if not char then return end

        ----------------------------------------------------
        -- POSITION / ROTATION DU JOUEUR
        ----------------------------------------------------
        local loc = nil
        local rot = nil

        pcall(function()
            loc = char:GetLocation()
            rot = char:GetRotation()
        end)

        if not loc then return end
        if not rot then rot = Rotator(0, 0, 0) end

        local forward = nil

        if data and data.dirX and data.dirY and data.dirZ then
            forward = Vector(data.dirX, data.dirY, data.dirZ)
        else
            forward = rot:GetForwardVector()
        end

        ----------------------------------------------------
        -- ANIMATION
        ----------------------------------------------------
        pcall(function()
            char:PlayAnimation("magicalanimset::08_combo")
        end)

        ----------------------------------------------------
        -- PARTICULE 1 SECONDE APRÈS L'ANIMATION
        ----------------------------------------------------
        Timer.SetTimeout(function()
            local currentLoc = nil
            local currentRot = nil

            pcall(function()
                currentLoc = char:GetLocation()
                currentRot = char:GetRotation()
            end)

            if not currentLoc then
                Console.Log("test2 : impossible de récupérer la position du joueur")
                return
            end

            if not currentRot then
                currentRot = rot
            end

            -- Spawn devant le joueur
            local spawnLoc = currentLoc + forward * 150 + Vector(0, 0, 90)

            -- IMPORTANT :
            -- Ce nom doit être une clé dans [assets.particles]
            local particleAsset = "glowing-orbs-pack::PS_GlowingOrb_39"

            local particle = nil

            local okParticle, errParticle = pcall(function()
                particle = Particle(
                    spawnLoc,
                    currentRot,
                    particleAsset,
                    false, -- auto destroy
                    true   -- auto activate
                )
            end)

            if not okParticle or not particle then
                Console.Log("Erreur particule test2 : " .. tostring(errParticle))
                return
            end

            Console.Log("Particule test2 créée : " .. particleAsset)

            ----------------------------------------------------
            -- HITBOX
            ----------------------------------------------------
            local hitBox = nil

            local okTrigger, errTrigger = pcall(function()
                hitBox = Trigger(
                    spawnLoc,
                    currentRot,
                    150,
                    TriggerType.Box,
                    true,
                    Color.RED,
                    { "Character" }
                )
            end)

            if not okTrigger then
                Console.Log("Erreur hitbox test2 : " .. tostring(errTrigger))
            end

            local alreadyHit = {}

            if hitBox then
                hitBox:Subscribe("BeginOverlap", function(selfTrigger, entity)
                    if not entity then return end
                    if entity == char then return end
                    if alreadyHit[entity] then return end

                    alreadyHit[entity] = true
                    sp:OnHit(caster, entity)
                end)
            end

            ----------------------------------------------------
            -- PROPULSION DEVANT LE JOUEUR EN 1 SECONDE
            ----------------------------------------------------
            local duration = 1.0
            local distance = sp.range or 1200
            local steps = 20
            local stepTime = duration / steps
            local currentStep = 0

            local intervalId = nil

            intervalId = Timer.SetInterval(function()
                currentStep = currentStep + 1

                local alpha = currentStep / steps
                local newLoc = spawnLoc + forward * distance * alpha

                if particle then
                    pcall(function()
                        particle:SetLocation(newLoc)
                    end)
                end

                if hitBox then
                    pcall(function()
                        hitBox:SetLocation(newLoc)
                    end)
                end

                if currentStep >= steps then
                    if intervalId then
                        pcall(function()
                            Timer.ClearInterval(intervalId)
                        end)

                        intervalId = nil
                    end
                end
            end, stepTime * 1000)

            ----------------------------------------------------
            -- DISPARITION 2 SECONDES APRÈS LE LANCEMENT
            ----------------------------------------------------
            Timer.SetTimeout(function()
                if intervalId then
                    pcall(function()
                        Timer.ClearInterval(intervalId)
                    end)

                    intervalId = nil
                end

                if particle then
                    pcall(function()
                        particle:Destroy()
                    end)

                    particle = nil
                    Console.Log("Particule test2 détruite")
                end

                if hitBox then
                    pcall(function()
                        hitBox:Destroy()
                    end)

                    hitBox = nil
                end
            end, 2000)

        end, 1000)
    end,
})

------------------------------------------------------------
-- ROUGE AIM + CAMERA SHAKE SYSTEM
------------------------------------------------------------
ROUGE_AIM_STATE = ROUGE_AIM_STATE or {}
ROUGE_AIM_REMOTE_REGISTERED = ROUGE_AIM_REMOTE_REGISTERED or false
ROUGE_CAMERA_SHAKE_REGISTERED = ROUGE_CAMERA_SHAKE_REGISTERED or false

local RougeAimState = ROUGE_AIM_STATE

local function NormalizeVector(v)
    if not v then return Vector(1, 0, 0) end

    local len = math.sqrt((v.X * v.X) + (v.Y * v.Y) + (v.Z * v.Z))

    if len <= 0.0001 then
        return Vector(1, 0, 0)
    end

    return Vector(v.X / len, v.Y / len, v.Z / len)
end

------------------------------------------------------------
-- CAMERA SHAKE ROUGE
------------------------------------------------------------
local function StartRougeCameraShake(intensity, durationMs, intervalMs)
    intensity = tonumber(intensity) or 3.0
    durationMs = tonumber(durationMs) or 350
    intervalMs = tonumber(intervalMs) or 16

    if not Client or not Client.GetLocalPlayer then return end
    if not Timer or not Timer.SetInterval then return end

    local localPlayer = nil

    pcall(function()
        localPlayer = Client.GetLocalPlayer()
    end)

    if not localPlayer then return end

    local baseRot = nil

    pcall(function()
        baseRot = localPlayer:GetCameraRotation()
    end)

    if not baseRot then return end

    local startTime = os.clock()
    local shakeInterval = nil

    shakeInterval = Timer.SetInterval(function()
        local elapsedMs = (os.clock() - startTime) * 1000

        if elapsedMs >= durationMs then
            if shakeInterval then
                pcall(function()
                    Timer.ClearInterval(shakeInterval)
                end)

                shakeInterval = nil
            end

            pcall(function()
                localPlayer:SetCameraRotation(baseRot)
            end)

            return
        end

        local power = 1.0 - (elapsedMs / durationMs)

        local pitchOffset = ((math.random() * 2.0) - 1.0) * intensity * power
        local yawOffset   = ((math.random() * 2.0) - 1.0) * intensity * power
        local rollOffset  = ((math.random() * 2.0) - 1.0) * intensity * 0.35 * power

        local shakeRot = Rotator(
            baseRot.Pitch + pitchOffset,
            baseRot.Yaw + yawOffset,
            baseRot.Roll + rollOffset
        )

        pcall(function()
            localPlayer:SetCameraRotation(shakeRot)
        end)
    end, intervalMs)
end

------------------------------------------------------------
-- REMOTE AIM CLIENT -> SERVER
------------------------------------------------------------
if not ROUGE_AIM_REMOTE_REGISTERED and Events and Events.SubscribeRemote then
    ROUGE_AIM_REMOTE_REGISTERED = true

    Events.SubscribeRemote("RougeUpdateAim", function(player, dirX, dirY, dirZ)
        if not player then return end
        if type(dirX) ~= "number" or type(dirY) ~= "number" or type(dirZ) ~= "number" then return end

        RougeAimState[player] = {
            dir = NormalizeVector(Vector(dirX, dirY, dirZ)),
            time = os.clock()
        }
    end)
end

------------------------------------------------------------
-- REMOTE CAMERA SHAKE SERVER -> CLIENT
------------------------------------------------------------
if not ROUGE_CAMERA_SHAKE_REGISTERED and Events and Events.SubscribeRemote then
    ROUGE_CAMERA_SHAKE_REGISTERED = true

    Events.SubscribeRemote("RougeCameraShake", function(intensity, durationMs, intervalMs)
        Console.Log("RougeCameraShake reçu côté client")
        StartRougeCameraShake(intensity, durationMs, intervalMs)
    end)
end

------------------------------------------------------------
-- REGISTER SPELL ROUGE
------------------------------------------------------------
SpellRegistry.Register({
    id       = "rouge",
    name     = "Rouge",
    desc     = "Lance Rouge : animation, particule rouge, propulsion et dégâts.",
    clan     = "gojo",
    category = "Clan",
    type     = "attack",
    damage   = 50,
    cost     = 35,
    cooldown = 3,
    rang     = "B",
    range    = 1800,
    iconUrl  = "https://i.pinimg.com/736x/6c/18/be/6c18bef2f92393a68631702c7abf0650.jpg",

    client_requiere = {
        "Trace.LineSingle"
    },

    ClientCast = function(self, char, player, _)
        local rot = nil

        pcall(function()
            rot = player:GetCameraRotation()
        end)

        if not rot then return nil end

        local forward = NormalizeVector(rot:GetForwardVector())

        local aimInterval = nil

        aimInterval = Timer.SetInterval(function()
            local camRot = nil

            pcall(function()
                camRot = player:GetCameraRotation()
            end)

            if not camRot then return end

            local camForward = NormalizeVector(camRot:GetForwardVector())

            pcall(function()
                Events.CallRemote(
                    "RougeUpdateAim",
                    camForward.X,
                    camForward.Y,
                    camForward.Z
                )
            end)
        end, 30)

        Timer.SetTimeout(function()
            if aimInterval then
                pcall(function()
                    Timer.ClearInterval(aimInterval)
                end)

                aimInterval = nil
            end
        end, 2600)

        return {
            dirX = forward.X,
            dirY = forward.Y,
            dirZ = forward.Z,
        }
    end,

    OnHit = function(sp, caster, victim, forward)
        if not victim then return end

        local casterChar = GetValidChar(caster)
        if casterChar and victim == casterChar then return end

        Console.Log("Rouge touche une cible")

        ----------------------------------------------------
        -- DÉGÂTS
        ----------------------------------------------------
        pcall(function()
            victim:ApplyDamage(sp.damage)
        end)

        ----------------------------------------------------
        -- IMPACT FRAME SUR LA CIBLE TOUCHÉE
        ----------------------------------------------------
        local victimLoc = nil
        local victimRot = nil

        pcall(function()
            victimLoc = victim:GetLocation()
            victimRot = victim:GetRotation()
        end)

        if not victimRot then
            victimRot = Rotator(0, 0, 0)
        end

        local impactFX = nil

        if victimLoc then
            local okImpact, errImpact = pcall(function()
                impactFX = Particle(
                    victimLoc + Vector(0, 0, 90),
                    victimRot,
                    "vefects::NS_Impact_Frame_Advanced_04_Always",
                    false,
                    true
                )
            end)

            if not okImpact or not impactFX then
                Console.Log("Erreur impact frame sur cible : " .. tostring(errImpact))
            end

            Timer.SetTimeout(function()
                if impactFX then
                    pcall(function()
                        impactFX:Destroy()
                    end)

                    impactFX = nil
                end
            end, 800)
        end

        ----------------------------------------------------
        -- PROPULSION DE LA CIBLE
        ----------------------------------------------------
        local pushDir = NormalizeVector(forward or Vector(1, 0, 0))
        local impulse = pushDir * 2200 + Vector(0, 0, 600)

        pcall(function()
            victim:AddImpulse(impulse, true)
        end)

        pcall(function()
            victim:SetVelocity(impulse)
        end)
    end,

    Cast = function(sp, caster, data)
        local char = GetValidChar(caster)
        if not char then return end

        local loc = nil
        local rot = nil

        pcall(function()
            loc = char:GetLocation()
            rot = char:GetRotation()
        end)

        if not loc then return end
        if not rot then rot = Rotator(0, 0, 0) end

        local aimForward = nil

        if data and data.dirX and data.dirY and data.dirZ then
            aimForward = NormalizeVector(Vector(data.dirX, data.dirY, data.dirZ))
        else
            aimForward = NormalizeVector(rot:GetForwardVector())
        end

        local function GetLatestAim()
            local saved = RougeAimState[caster]

            if saved and saved.dir and saved.time then
                if (os.clock() - saved.time) < 0.5 then
                    return NormalizeVector(saved.dir)
                end
            end

            return aimForward
        end

        pcall(function()
            char:PlayAnimation("animtest::AM_red")
        end)

        ----------------------------------------------------
        -- FRAME 23
        ----------------------------------------------------
        Timer.SetTimeout(function()
            local currentLoc = nil
            local currentRot = nil

            pcall(function()
                currentLoc = char:GetLocation()
                currentRot = char:GetRotation()
            end)

            if not currentLoc then return end
            if not currentRot then currentRot = rot end

            local currentAim = GetLatestAim()
            local spawnLoc = currentLoc + currentAim * 170 + Vector(0, 0, 95)

            local redParticle = nil

            local okParticle, errParticle = pcall(function()
                redParticle = Particle(
                    spawnLoc,
                    currentRot,
                    "glowing-orbs-pack::PS_GlowingOrb_39",
                    false,
                    true
                )
            end)

            if not okParticle or not redParticle then
                Console.Log("Erreur spawn PS_GlowingOrb_39 : " .. tostring(errParticle))
                return
            end

            Console.Log("PS_GlowingOrb_39 spawn OK")

            ----------------------------------------------------
            -- GROSSISSEMENT ANIMÉ FRAME 23 -> FRAME 70
            ----------------------------------------------------
            local startScale = 0.02
            local normalScale = 1.0

            pcall(function()
                redParticle:SetScale(Vector(startScale, startScale, startScale))
            end)

            local growDuration = 1.567
            local growStartTime = os.clock()
            local growInterval = nil

            growInterval = Timer.SetInterval(function()
                if not redParticle then
                    if growInterval then
                        pcall(function()
                            Timer.ClearInterval(growInterval)
                        end)

                        growInterval = nil
                    end

                    return
                end

                local elapsed = os.clock() - growStartTime
                local alpha = elapsed / growDuration

                if alpha < 0 then alpha = 0 end
                if alpha > 1 then alpha = 1 end

                local smoothAlpha = alpha * alpha * (3 - 2 * alpha)
                local scale = startScale + (normalScale - startScale) * smoothAlpha

                pcall(function()
                    redParticle:SetScale(Vector(scale, scale, scale))
                end)

                if alpha >= 1 then
                    pcall(function()
                        redParticle:SetScale(Vector(normalScale, normalScale, normalScale))
                    end)

                    if growInterval then
                        pcall(function()
                            Timer.ClearInterval(growInterval)
                        end)

                        growInterval = nil
                    end
                end
            end, 16)

            ----------------------------------------------------
            -- SUIVI JOUEUR + CAMÉRA JUSQU'À FRAME 70
            ----------------------------------------------------
            local followInterval = nil
            local lastAimForward = currentAim

            followInterval = Timer.SetInterval(function()
                if not redParticle then return end

                local followLoc = nil
                local followRot = nil

                pcall(function()
                    followLoc = char:GetLocation()
                    followRot = char:GetRotation()
                end)

                if not followLoc then return end
                if not followRot then followRot = currentRot end

                local liveAim = GetLatestAim()
                lastAimForward = liveAim

                local newParticleLoc = followLoc + liveAim * 170 + Vector(0, 0, 95)

                pcall(function()
                    redParticle:SetLocation(newParticleLoc)
                    redParticle:SetRotation(followRot)
                end)
            end, 10)

            ----------------------------------------------------
            -- FRAME 70
            ----------------------------------------------------
            Timer.SetTimeout(function()
                if not redParticle then return end

                if growInterval then
                    pcall(function()
                        Timer.ClearInterval(growInterval)
                    end)

                    growInterval = nil
                end

                pcall(function()
                    redParticle:SetScale(Vector(normalScale, normalScale, normalScale))
                end)

                if followInterval then
                    pcall(function()
                        Timer.ClearInterval(followInterval)
                    end)

                    followInterval = nil
                end

                local launchLoc = nil
                local launchRot = nil

                pcall(function()
                    launchLoc = char:GetLocation()
                    launchRot = char:GetRotation()
                end)

                if not launchLoc then return end
                if not launchRot then launchRot = currentRot end

                local launchForward = NormalizeVector(GetLatestAim() or lastAimForward or aimForward)
                local startLoc = launchLoc + launchForward * 170 + Vector(0, 0, 95)

                pcall(function()
                    redParticle:SetLocation(startLoc)
                    redParticle:SetRotation(launchRot)
                    redParticle:SetScale(Vector(normalScale, normalScale, normalScale))
                end)

                ------------------------------------------------
                -- TREMBLEMENT PLUS FORT AU MOMENT DU TIR
                ------------------------------------------------
                pcall(function()
                    if Events and Events.CallRemote and caster then
                        Events.CallRemote(
                            "RougeCameraShake",
                            caster,
                            4.0,  -- intensité plus forte
                            420,  -- durée en ms
                            3    -- tremblement plus rapide
                        )
                    end
                end)

                ------------------------------------------------
                -- HITBOX
                ------------------------------------------------
                local hitBox = nil

                local okTrigger, errTrigger = pcall(function()
                    hitBox = Trigger(
                        startLoc,
                        launchRot,
                        300,
                        TriggerType.Sphere,
                        true,
                        Color.RED,
                        { "Character", "CharacterSimple" }
                    )
                end)

                if not okTrigger or not hitBox then
                    Console.Log("Erreur hitbox Rouge : " .. tostring(errTrigger))
                end

                local alreadyHit = {}

                if hitBox then
                    hitBox:Subscribe("BeginOverlap", function(selfTrigger, entity)
                        if not entity then return end
                        if entity == char then return end
                        if alreadyHit[entity] then return end

                        alreadyHit[entity] = true
                        sp:OnHit(caster, entity, launchForward)
                    end)
                end

                ------------------------------------------------
                -- PROPULSION CONTINUE
                ------------------------------------------------
                local moveSpeed = 2600
                local moveStartTime = os.clock()
                local moveInterval = nil

                moveInterval = Timer.SetInterval(function()
                    if not redParticle then
                        if moveInterval then
                            pcall(function()
                                Timer.ClearInterval(moveInterval)
                            end)

                            moveInterval = nil
                        end

                        return
                    end

                    local elapsed = os.clock() - moveStartTime
                    local distance = moveSpeed * elapsed
                    local newLoc = startLoc + launchForward * distance

                    pcall(function()
                        redParticle:SetLocation(newLoc)
                        redParticle:SetRotation(launchRot)
                    end)

                    if hitBox then
                        pcall(function()
                            hitBox:SetLocation(newLoc)
                            hitBox:SetRotation(launchRot)
                        end)
                    end
                end, 10)

                ------------------------------------------------
                -- DESTRUCTION
                ------------------------------------------------
                local destroyDelay = 1500

                Timer.SetTimeout(function()
                    if growInterval then
                        pcall(function()
                            Timer.ClearInterval(growInterval)
                        end)

                        growInterval = nil
                    end

                    if followInterval then
                        pcall(function()
                            Timer.ClearInterval(followInterval)
                        end)

                        followInterval = nil
                    end

                    if moveInterval then
                        pcall(function()
                            Timer.ClearInterval(moveInterval)
                        end)

                        moveInterval = nil
                    end

                    if hitBox then
                        pcall(function()
                            hitBox:Destroy()
                        end)

                        hitBox = nil
                    end

                    if redParticle then
                        pcall(function()
                            redParticle:Destroy()
                        end)

                        redParticle = nil
                    end

                    RougeAimState[caster] = nil

                    Console.Log("Rouge terminé : particule détruite")
                end, destroyDelay)

            end, 1567)

        end, 767)
    end,
})
------------------------------------------------------------
-- ÉCLAIRE NOIR AIM SYSTEM
------------------------------------------------------------
ECLAIRE_NOIR_AIM_STATE = ECLAIRE_NOIR_AIM_STATE or {}
ECLAIRE_NOIR_AIM_REMOTE_REGISTERED = ECLAIRE_NOIR_AIM_REMOTE_REGISTERED or false

local EclaireNoirAimState = ECLAIRE_NOIR_AIM_STATE

local function NormalizeVector(v)
    if not v then return Vector(1, 0, 0) end

    local len = math.sqrt((v.X * v.X) + (v.Y * v.Y) + (v.Z * v.Z))

    if len <= 0.0001 then
        return Vector(1, 0, 0)
    end

    return Vector(v.X / len, v.Y / len, v.Z / len)
end

------------------------------------------------------------
-- CAMERA SHAKE ÉCLAIRE NOIR
------------------------------------------------------------
ECLAIRE_NOIR_CAMERA_SHAKE_REMOTE_REGISTERED = ECLAIRE_NOIR_CAMERA_SHAKE_REMOTE_REGISTERED or false

local function StartEclaireNoirCameraShake(intensity, durationMs, intervalMs)
    intensity = tonumber(intensity) or 3.0
    durationMs = tonumber(durationMs) or 280
    intervalMs = tonumber(intervalMs) or 16

    if not Client or not Client.GetLocalPlayer then return end
    if not Timer or not Timer.SetInterval then return end

    local localPlayer = nil

    pcall(function()
        localPlayer = Client.GetLocalPlayer()
    end)

    if not localPlayer then return end

    local baseRot = nil

    pcall(function()
        baseRot = localPlayer:GetCameraRotation()
    end)

    if not baseRot then return end

    local startTime = os.clock()
    local shakeInterval = nil

    shakeInterval = Timer.SetInterval(function()
        local elapsedMs = (os.clock() - startTime) * 1000

        if elapsedMs >= durationMs then
            if shakeInterval then
                pcall(function()
                    Timer.ClearInterval(shakeInterval)
                end)

                shakeInterval = nil
            end

            pcall(function()
                localPlayer:SetCameraRotation(baseRot)
            end)

            return
        end

        local power = 1.0 - (elapsedMs / durationMs)

        local pitchOffset = ((math.random() * 2.0) - 1.0) * intensity * power
        local yawOffset   = ((math.random() * 2.0) - 1.0) * intensity * power
        local rollOffset  = ((math.random() * 2.0) - 1.0) * intensity * 0.35 * power

        local shakeRot = Rotator(
            baseRot.Pitch + pitchOffset,
            baseRot.Yaw + yawOffset,
            baseRot.Roll + rollOffset
        )

        pcall(function()
            localPlayer:SetCameraRotation(shakeRot)
        end)
    end, intervalMs)
end

if not ECLAIRE_NOIR_CAMERA_SHAKE_REMOTE_REGISTERED and Events and Events.SubscribeRemote then
    ECLAIRE_NOIR_CAMERA_SHAKE_REMOTE_REGISTERED = true

    Events.SubscribeRemote("EclaireNoirCameraShake", function(intensity, durationMs, intervalMs)
        StartEclaireNoirCameraShake(intensity, durationMs, intervalMs)
    end)
end

------------------------------------------------------------
-- REMOTE AIM CLIENT -> SERVER
------------------------------------------------------------
if not ECLAIRE_NOIR_AIM_REMOTE_REGISTERED and Events and Events.SubscribeRemote then
    ECLAIRE_NOIR_AIM_REMOTE_REGISTERED = true

    Events.SubscribeRemote("EclaireNoirUpdateAim", function(player, dirX, dirY, dirZ)
        if not player then return end
        if type(dirX) ~= "number" or type(dirY) ~= "number" or type(dirZ) ~= "number" then return end

        EclaireNoirAimState[player] = {
            dir = NormalizeVector(Vector(dirX, dirY, dirZ)),
            time = os.clock()
        }
    end)
end

------------------------------------------------------------
-- REGISTER SPELL ÉCLAIRE NOIR
------------------------------------------------------------
SpellRegistry.Register({
    id       = "eclaire_noir",
    name     = "Éclaire noir D",
    desc     = "Lance un éclair noir droit devant.",
    clan     = "Foudre",
    category = "Hériditaire",
    type     = "attack",
    damage   = 20,
    cost     = 20,
    cooldown = 2,
    rang     = "C",
    range    = 2200,
    iconUrl  = "https://i.pinimg.com/736x/c0/64/4e/c0644eed8386edac94eb32292d7524c7.jpg",

    client_requiere = {
        "Trace.LineSingle"
    },

    ClientCast = function(self, char, player, _)
        local rot = nil

        pcall(function()
            rot = player:GetCameraRotation()
        end)

        if not rot then return nil end

        local forward = NormalizeVector(rot:GetForwardVector())

        local aimInterval = nil

        aimInterval = Timer.SetInterval(function()
            local camRot = nil

            pcall(function()
                camRot = player:GetCameraRotation()
            end)

            if not camRot then return end

            local camForward = NormalizeVector(camRot:GetForwardVector())

            pcall(function()
                Events.CallRemote(
                    "EclaireNoirUpdateAim",
                    camForward.X,
                    camForward.Y,
                    camForward.Z
                )
            end)
        end, 30)

        Timer.SetTimeout(function()
            if aimInterval then
                pcall(function()
                    Timer.ClearInterval(aimInterval)
                end)

                aimInterval = nil
            end
        end, 2000)

        return {
            dirX = forward.X,
            dirY = forward.Y,
            dirZ = forward.Z,
        }
    end,

    OnHit = function(sp, caster, victim, forward)
        if not victim then return end

        local casterChar = GetValidChar(caster)
        if casterChar and victim == casterChar then return end

        Console.Log("Éclaire noir touche une cible")

        ----------------------------------------------------
        -- DÉGÂTS
        ----------------------------------------------------
        pcall(function()
            victim:ApplyDamage(sp.damage)
        end)

        ----------------------------------------------------
        -- POSITION / ROTATION DE LA CIBLE
        ----------------------------------------------------
        local victimLoc = nil
        local victimRot = nil

        pcall(function()
            victimLoc = victim:GetLocation()
            victimRot = victim:GetRotation()
        end)

        if not victimRot then
            victimRot = Rotator(0, 0, 0)
        end

        ----------------------------------------------------
        -- SON D'IMPACT ÉLECTRIQUE
        ----------------------------------------------------
        if victimLoc then
            local okSound, errSound = pcall(function()
                Sound(
                    victimLoc,
                    "animtest::impactelecteique",
                    false,
                    true,
                    SoundType.SFX,
                    2.0,
                    2.0,
                    260,
                    2200
                )
            end)

            if not okSound then
                Console.Log("Erreur son impactelecteique : " .. tostring(errSound))
            end
        end

        ----------------------------------------------------
        -- PARTICULE HIT SUR LA CIBLE
        ----------------------------------------------------
        local hitFX = nil

        if victimLoc then
            local okHit, errHit = pcall(function()
                hitFX = Particle(
                    victimLoc + Vector(0, 0, 90),
                    victimRot,
                    "stylized-fx6::P_Lightning_Hit",
                    false,
                    true
                )
            end)

            if not okHit or not hitFX then
                Console.Log("Erreur P_Lightning_Hit : " .. tostring(errHit))
            end

            Timer.SetTimeout(function()
                if hitFX then
                    pcall(function()
                        hitFX:Destroy()
                    end)

                    hitFX = nil
                end
            end, 800)
        end

        ----------------------------------------------------
        -- PETITE PROPULSION DE LA CIBLE
        ----------------------------------------------------
        local pushDir = NormalizeVector(forward or Vector(1, 0, 0))
        local impulse = pushDir * 900 + Vector(0, 0, 250)

        pcall(function()
            victim:AddImpulse(impulse, true)
        end)

        pcall(function()
            victim:SetVelocity(impulse)
        end)
    end,

    Cast = function(sp, caster, data)
        local char = GetValidChar(caster)
        if not char then return end

        local loc = nil
        local rot = nil

        pcall(function()
            loc = char:GetLocation()
            rot = char:GetRotation()
        end)

        if not loc then return end
        if not rot then rot = Rotator(0, 0, 0) end

        ----------------------------------------------------
        -- DIRECTION INITIALE CAMÉRA
        ----------------------------------------------------
        local aimForward = nil

        if data and data.dirX and data.dirY and data.dirZ then
            aimForward = NormalizeVector(Vector(data.dirX, data.dirY, data.dirZ))
        else
            aimForward = NormalizeVector(rot:GetForwardVector())
        end

        local function GetLatestAim()
            local saved = EclaireNoirAimState[caster]

            if saved and saved.dir and saved.time then
                if (os.clock() - saved.time) < 0.5 then
                    return NormalizeVector(saved.dir)
                end
            end

            return aimForward
        end

        ----------------------------------------------------
        -- ANIMATION AM_foudred
        ----------------------------------------------------
        pcall(function()
            char:PlayAnimation("animtest::AM_foudred")
        end)

        ----------------------------------------------------
        -- FRAME 27
        -- 27 frames à 30 FPS ≈ 900 ms
        ----------------------------------------------------
        Timer.SetTimeout(function()
            local currentLoc = nil
            local currentRot = nil

            pcall(function()
                currentLoc = char:GetLocation()
                currentRot = char:GetRotation()
            end)

            if not currentLoc then return end
            if not currentRot then currentRot = rot end

            local launchForward = GetLatestAim()
            local spawnLoc = currentLoc + launchForward * 170 + Vector(0, 0, 95)

            ----------------------------------------------------
            -- PARTICULE SHOT AU DÉPART
            ----------------------------------------------------
            local shotFX = nil

            local okShot, errShot = pcall(function()
                shotFX = Particle(
                    spawnLoc,
                    currentRot,
                    "stylized-fx6::P_Lightning_Shot_01",
                    false,
                    true
                )
            end)

            if not okShot or not shotFX then
                Console.Log("Erreur P_Lightning_Shot_01 : " .. tostring(errShot))
            end

            Timer.SetTimeout(function()
                if shotFX then
                    pcall(function()
                        shotFX:Destroy()
                    end)

                    shotFX = nil
                end
            end, 1000)

            ----------------------------------------------------
            -- PARTICULE BULLET PROPULSÉE
            ----------------------------------------------------
            local bulletFX = nil

            local okBullet, errBullet = pcall(function()
                bulletFX = Particle(
                    spawnLoc,
                    currentRot,
                    "stylized-fx6::P_Lightning_Bullet_01",
                    false,
                    true
                )
            end)

            if not okBullet or not bulletFX then
                Console.Log("Erreur P_Lightning_Bullet_01 : " .. tostring(errBullet))
                return
            end

            Console.Log("P_Lightning_Bullet_01 spawn OK")

            ----------------------------------------------------
            -- TREMBLEMENT DE CAMÉRA DU CASTER
            ----------------------------------------------------
            pcall(function()
                if Events and Events.CallRemote and caster then
                    Events.CallRemote(
                        "EclaireNoirCameraShake",
                        caster,
                        4.0,  -- intensité du tremblement
                        320,  -- durée en ms
                        3    -- vitesse du tremblement
                    )
                end
            end)

            ----------------------------------------------------
            -- HITBOX COLLÉE À LA BULLET
            ----------------------------------------------------
            local hitBox = nil

            local okTrigger, errTrigger = pcall(function()
                hitBox = Trigger(
                    spawnLoc,
                    currentRot,
                    180,
                    TriggerType.Sphere,
                    true,
                    Color.RED,
                    { "Character", "CharacterSimple" }
                )
            end)

            if not okTrigger or not hitBox then
                Console.Log("Erreur hitbox Éclaire noir : " .. tostring(errTrigger))
            end

            local alreadyHit = {}
            local projectileDestroyed = false
            local moveInterval = nil

            local function DestroyLightningProjectile()
                if projectileDestroyed then return end
                projectileDestroyed = true

                if moveInterval then
                    pcall(function()
                        Timer.ClearInterval(moveInterval)
                    end)

                    moveInterval = nil
                end

                if hitBox then
                    pcall(function()
                        hitBox:Destroy()
                    end)

                    hitBox = nil
                end

                if bulletFX then
                    pcall(function()
                        bulletFX:Destroy()
                    end)

                    bulletFX = nil
                end

                EclaireNoirAimState[caster] = nil

                Console.Log("Éclaire noir projectile détruit")
            end

            if hitBox then
                hitBox:Subscribe("BeginOverlap", function(selfTrigger, entity)
                    if projectileDestroyed then return end
                    if not entity then return end
                    if entity == char then return end
                    if alreadyHit[entity] then return end

                    alreadyHit[entity] = true

                    sp:OnHit(caster, entity, launchForward)

                    ------------------------------------------------
                    -- DISPARAÎT DIRECTEMENT SI TOUCHE UN ENNEMI
                    ------------------------------------------------
                    DestroyLightningProjectile()
                end)
            end

            ----------------------------------------------------
            -- PROPULSION CONTINUE DE LA BULLET
            ----------------------------------------------------
            local moveSpeed = 3200
            local moveStartTime = os.clock()
            local destroyDelay = 2000

            moveInterval = Timer.SetInterval(function()
                if projectileDestroyed then return end

                if not bulletFX then
                    DestroyLightningProjectile()
                    return
                end

                local elapsed = os.clock() - moveStartTime
                local distance = moveSpeed * elapsed
                local newLoc = spawnLoc + launchForward * distance

                pcall(function()
                    bulletFX:SetLocation(newLoc)
                    bulletFX:SetRotation(currentRot)
                end)

                if hitBox then
                    pcall(function()
                        hitBox:SetLocation(newLoc)
                        hitBox:SetRotation(currentRot)
                    end)
                end
            end, 10)

            ----------------------------------------------------
            -- SI NE TOUCHE PERSONNE : DISPARITION APRÈS 2 SECONDES
            ----------------------------------------------------
            Timer.SetTimeout(function()
                DestroyLightningProjectile()
            end, destroyDelay)

        end, 900)
    end,
})

------------------------------------------------------------
-- FOUDRE FRAPPANTE AIM + ORAGE AOE SYSTEM
------------------------------------------------------------
FOUDRE_ORAGE_AIM_STATE = FOUDRE_ORAGE_AIM_STATE or {}
FOUDRE_ORAGE_AIM_REMOTE_REGISTERED = FOUDRE_ORAGE_AIM_REMOTE_REGISTERED or false
FOUDRE_ORAGE_CAMERA_SHAKE_REGISTERED = FOUDRE_ORAGE_CAMERA_SHAKE_REGISTERED or false

local FoudreOrageAimState = FOUDRE_ORAGE_AIM_STATE

------------------------------------------------------------
-- CONFIG ASSETS
------------------------------------------------------------
local STORM_CLOUD_FX = "tornadoes-vfxpack::P_Clouds_Transarency"
local LIGHTNING_SHOT_FX = "stylized-fx6::P_LightningShot"
local SHOCK_TRIANGLE_FX = "stylized-fx6::P_Shock_Triangle_01"
local LIGHTNING_HIT_FX = "stylized-fx6::P_Lightning_Hit"
local LIGHTNING_SOUND = "animtest::foudre_"
local LAND_SMOKE_FX = "simple-cartoon-fx::Land_Smoke"

------------------------------------------------------------
-- UTILS
------------------------------------------------------------
local function NormalizeVector(v)
    if not v then return Vector(1, 0, 0) end

    local len = math.sqrt((v.X * v.X) + (v.Y * v.Y) + (v.Z * v.Z))

    if len <= 0.0001 then
        return Vector(1, 0, 0)
    end

    return Vector(v.X / len, v.Y / len, v.Z / len)
end

local function RandomPointInCircle(center, radius)
    local angle = math.random() * math.pi * 2
    local dist = math.sqrt(math.random()) * radius

    local x = math.cos(angle) * dist
    local y = math.sin(angle) * dist

    return center + Vector(x, y, 0)
end

------------------------------------------------------------
-- ROTATION VERTICALE POUR TON ASSET
-- IMPORTANT :
-- Pitch = 90 / -90 couchait la particule.
-- Donc on garde Pitch = 0 et Roll = 0.
-- On randomise seulement le Yaw.
------------------------------------------------------------
local function GetVerticalLightningRotation()
    return Rotator(
        0,
        math.random(0, 360),
        0
    )
end

------------------------------------------------------------
-- CAMERA SHAKE CLIENT
------------------------------------------------------------
local function StartFoudreOrageCameraShake(intensity, durationMs, intervalMs)
    intensity = tonumber(intensity) or 4.0
    durationMs = tonumber(durationMs) or 350
    intervalMs = tonumber(intervalMs) or 14

    if not Client or not Client.GetLocalPlayer then return end
    if not Timer or not Timer.SetInterval then return end

    local localPlayer = nil

    pcall(function()
        localPlayer = Client.GetLocalPlayer()
    end)

    if not localPlayer then return end

    local baseRot = nil

    pcall(function()
        baseRot = localPlayer:GetCameraRotation()
    end)

    if not baseRot then return end

    local startTime = os.clock()
    local shakeInterval = nil

    shakeInterval = Timer.SetInterval(function()
        local elapsedMs = (os.clock() - startTime) * 1000

        if elapsedMs >= durationMs then
            if shakeInterval then
                pcall(function()
                    Timer.ClearInterval(shakeInterval)
                end)

                shakeInterval = nil
            end

            pcall(function()
                localPlayer:SetCameraRotation(baseRot)
            end)

            return
        end

        local power = 1.0 - (elapsedMs / durationMs)

        local pitchOffset = ((math.random() * 2.0) - 1.0) * intensity * power
        local yawOffset   = ((math.random() * 2.0) - 1.0) * intensity * power
        local rollOffset  = ((math.random() * 2.0) - 1.0) * intensity * 0.35 * power

        local shakeRot = Rotator(
            baseRot.Pitch + pitchOffset,
            baseRot.Yaw + yawOffset,
            baseRot.Roll + rollOffset
        )

        pcall(function()
            localPlayer:SetCameraRotation(shakeRot)
        end)
    end, intervalMs)
end

if not FOUDRE_ORAGE_CAMERA_SHAKE_REGISTERED and Events and Events.SubscribeRemote then
    FOUDRE_ORAGE_CAMERA_SHAKE_REGISTERED = true

    Events.SubscribeRemote("FoudreOrageCameraShake", function(intensity, durationMs, intervalMs)
        StartFoudreOrageCameraShake(intensity, durationMs, intervalMs)
    end)
end

------------------------------------------------------------
-- REMOTE AIM CLIENT -> SERVER
------------------------------------------------------------
if not FOUDRE_ORAGE_AIM_REMOTE_REGISTERED and Events and Events.SubscribeRemote then
    FOUDRE_ORAGE_AIM_REMOTE_REGISTERED = true

    Events.SubscribeRemote("FoudreOrageUpdateAim", function(player, x, y, z)
        if not player then return end
        if type(x) ~= "number" or type(y) ~= "number" or type(z) ~= "number" then return end

        FoudreOrageAimState[player] = {
            loc = Vector(x, y, z),
            time = os.clock()
        }
    end)
end

------------------------------------------------------------
-- REGISTER SPELL FOUDRE FRAPPANTE
------------------------------------------------------------
SpellRegistry.Register({
    id       = "foudre_frappante",
    name     = "Foudre frappante",
    desc     = "Crée un orage sur une zone ciblée.",
    clan     = "Foudre",
    category = "Hériditaire",
    type     = "attack",

    damage      = 10, -- dégâts quand P_LightningShot touche
    zone_damage = 5,  -- dégâts si une cible reste dans la zone

    cost     = 30,
    cooldown = 4,
    rang     = "B",
    range    = 2500,
    iconUrl  = "https://i.pinimg.com/736x/4d/fe/82/4dfe82cb63cbbf221d122c6cce24c240.jpg",

    client_requiere = {
        "Trace.LineSingle"
    },

    ClientCast = function(self, char, player, _)
        local rot = nil
        local charLoc = nil

        pcall(function()
            rot = player:GetCameraRotation()
            charLoc = char:GetLocation()
        end)

        if not rot or not charLoc then return nil end

        local forward = NormalizeVector(rot:GetForwardVector())
        local defaultTarget = charLoc + forward * 1200
        defaultTarget = Vector(defaultTarget.X, defaultTarget.Y, charLoc.Z - 80)

        ----------------------------------------------------
        -- LE JOUEUR PEUT VISER JUSQU'À LA FRAME 23
        ----------------------------------------------------
        local aimInterval = nil

        aimInterval = Timer.SetInterval(function()
            local camRot = nil
            local liveCharLoc = nil

            pcall(function()
                camRot = player:GetCameraRotation()
                liveCharLoc = char:GetLocation()
            end)

            if not camRot or not liveCharLoc then return end

            local camForward = NormalizeVector(camRot:GetForwardVector())

            local targetLoc = liveCharLoc + camForward * 1200
            targetLoc = Vector(targetLoc.X, targetLoc.Y, liveCharLoc.Z - 80)

            pcall(function()
                Events.CallRemote(
                    "FoudreOrageUpdateAim",
                    targetLoc.X,
                    targetLoc.Y,
                    targetLoc.Z
                )
            end)
        end, 30)

        ----------------------------------------------------
        -- STOP AIM À LA FRAME 23
        -- 23 frames à 30 FPS ≈ 767 ms
        ----------------------------------------------------
        Timer.SetTimeout(function()
            if aimInterval then
                pcall(function()
                    Timer.ClearInterval(aimInterval)
                end)

                aimInterval = nil
            end
        end, 767)

        return {
            targetX = defaultTarget.X,
            targetY = defaultTarget.Y,
            targetZ = defaultTarget.Z
        }
    end,

    --------------------------------------------------------
    -- DÉGÂTS DE LA PARTICULE P_LightningShot
    --------------------------------------------------------
    OnHit = function(sp, caster, victim, strikeLoc)
        if not victim then return end

        local casterChar = GetValidChar(caster)
        if casterChar and victim == casterChar then return end

        ----------------------------------------------------
        -- 10 DÉGÂTS BONUS DE P_LightningShot
        ----------------------------------------------------
        pcall(function()
            victim:ApplyDamage(sp.damage or 10)
        end)

        Console.Log("Foudre frappante : P_LightningShot touche pour " .. tostring(sp.damage or 10) .. " dégâts")

        ----------------------------------------------------
        -- PARTICULE HIT SUR LA CIBLE
        ----------------------------------------------------
        local victimLoc = nil
        local victimRot = nil

        pcall(function()
            victimLoc = victim:GetLocation()
            victimRot = victim:GetRotation()
        end)

        if not victimRot then
            victimRot = Rotator(0, 0, 0)
        end

        if victimLoc then
            local hitFX = nil

            local okHit, errHit = pcall(function()
                hitFX = Particle(
                    victimLoc + Vector(0, 0, 90),
                    victimRot,
                    LIGHTNING_HIT_FX,
                    false,
                    true
                )
            end)

            if not okHit or not hitFX then
                Console.Log("Erreur P_Lightning_Hit : " .. tostring(errHit))
            end

            Timer.SetTimeout(function()
                if hitFX then
                    pcall(function()
                        hitFX:Destroy()
                    end)

                    hitFX = nil
                end
            end, 700)
        end
    end,

    Cast = function(sp, caster, data)
        local char = GetValidChar(caster)
        if not char then return end

        local loc = nil
        local rot = nil

        pcall(function()
            loc = char:GetLocation()
            rot = char:GetRotation()
        end)

        if not loc then return end
        if not rot then rot = Rotator(0, 0, 0) end

        ----------------------------------------------------
        -- ANIMATION
        ----------------------------------------------------
        pcall(function()
            char:PlayAnimation("animtest::AM_foudrec")
        end)

        ----------------------------------------------------
        -- POSITION INITIALE SI LE CLIENT N'A RIEN ENVOYÉ
        ----------------------------------------------------
        local fallbackTarget = loc + NormalizeVector(rot:GetForwardVector()) * 1200
        fallbackTarget = Vector(fallbackTarget.X, fallbackTarget.Y, loc.Z - 80)

        if data and data.targetX and data.targetY and data.targetZ then
            fallbackTarget = Vector(data.targetX, data.targetY, data.targetZ)
        end

        local function GetLatestTarget()
            local saved = FoudreOrageAimState[caster]

            if saved and saved.loc and saved.time then
                if (os.clock() - saved.time) < 0.6 then
                    return saved.loc
                end
            end

            return fallbackTarget
        end

        ----------------------------------------------------
        -- FRAME 23
        ----------------------------------------------------
        Timer.SetTimeout(function()
            local targetLoc = GetLatestTarget()
            if not targetLoc then return end

            Console.Log("Foudre frappante : zone validée à la frame 23")

            ----------------------------------------------------
            -- CONFIG ZONE D'ORAGE
            ----------------------------------------------------
            local zoneRadius = 520
            local strikeRadius = 170
            local stormDuration = 3000
            local strikeIntervalMs = 260
            local zoneDamageIntervalMs = 700
            local cloudHeight = 200

            local stormCenter = targetLoc
            local cloudLoc = stormCenter + Vector(0, 0, cloudHeight)

            ----------------------------------------------------
            -- NUAGE D'ORAGE AU-DESSUS DE LA ZONE
            ----------------------------------------------------
            local cloudFX = nil

            local okCloud, errCloud = pcall(function()
                cloudFX = Particle(
                    cloudLoc,
                    Rotator(0, 0, 0),
                    STORM_CLOUD_FX,
                    false,
                    true
                )
            end)

            if not okCloud or not cloudFX then
                Console.Log("Erreur nuage orage : " .. tostring(errCloud))
            end

            ----------------------------------------------------
            -- ZONE VISUELLE AU SOL
            ----------------------------------------------------
            local zoneFX = nil

            local okZoneFX, errZoneFX = pcall(function()
                zoneFX = Particle(
                    stormCenter + Vector(0, 0, 8),
                    Rotator(0, 0, 0),
                    SHOCK_TRIANGLE_FX,
                    false,
                    true
                )
            end)

            if not okZoneFX or not zoneFX then
                Console.Log("Erreur zone P_Shock_Triangle_01 : " .. tostring(errZoneFX))
            else
                pcall(function()
                    zoneFX:SetScale(Vector(2.8, 2.8, 2.8))
                end)
            end

            ----------------------------------------------------
            -- ZONE DE DÉGÂTS CONTINUE
            -- SI LA CIBLE RESTE DANS LA ZONE = 5 DÉGÂTS
            ----------------------------------------------------
            local zoneDamageTrigger = nil
            local entitiesInsideZone = {}
            local zoneDamageInterval = nil

            local okZoneTrigger, errZoneTrigger = pcall(function()
                zoneDamageTrigger = Trigger(
                    stormCenter,
                    Rotator(0, 0, 0),
                    zoneRadius,
                    TriggerType.Sphere,
                    true,
                    Color.RED,
                    { "Character", "CharacterSimple" }
                )
            end)

            if not okZoneTrigger or not zoneDamageTrigger then
                Console.Log("Erreur zone damage trigger : " .. tostring(errZoneTrigger))
            end

            if zoneDamageTrigger then
                zoneDamageTrigger:Subscribe("BeginOverlap", function(selfTrigger, entity)
                    if not entity then return end
                    if entity == char then return end

                    entitiesInsideZone[entity] = true
                end)

                zoneDamageTrigger:Subscribe("EndOverlap", function(selfTrigger, entity)
                    if not entity then return end

                    entitiesInsideZone[entity] = nil
                end)
            end

            zoneDamageInterval = Timer.SetInterval(function()
                for entity, _ in pairs(entitiesInsideZone) do
                    if entity and entity ~= char then
                        pcall(function()
                            entity:ApplyDamage(sp.zone_damage or 5)
                        end)

                        Console.Log("Foudre frappante : dégâts de zone " .. tostring(sp.zone_damage or 5))
                    end
                end
            end, zoneDamageIntervalMs)

            ----------------------------------------------------
            -- FONCTION POUR UNE FRAPPE ALÉATOIRE
            ----------------------------------------------------
            local firstStrike = true
            local strikeCount = 0
            local maxStrikes = math.floor(stormDuration / strikeIntervalMs)

            local stormInterval = nil

            local function SpawnRandomLightningStrike()
                strikeCount = strikeCount + 1

                local strikeLoc = RandomPointInCircle(stormCenter, zoneRadius)

                ------------------------------------------------
                -- ROTATION VERTICALE POUR LES PARTICULES ALÉATOIRES
                -- PAS de Pitch 90 / -90.
                -- On garde l'orientation verticale de base de l'asset.
                ------------------------------------------------
                local verticalRot = GetVerticalLightningRotation()

                ------------------------------------------------
                -- PARTICULE P_LightningShot
                ------------------------------------------------
                local lightningFX = nil

                local okLightning, errLightning = pcall(function()
                    lightningFX = Particle(
                        strikeLoc + Vector(0, 0, 30),
                        verticalRot,
                        LIGHTNING_SHOT_FX,
                        false,
                        true
                    )
                end)

                if not okLightning or not lightningFX then
                    Console.Log("Erreur P_LightningShot : " .. tostring(errLightning))
                else
                    pcall(function()
                        lightningFX:SetRotation(verticalRot)
                    end)
                end

                ------------------------------------------------
                -- PARTICULE P_Shock_Triangle_01
                ------------------------------------------------
                local shockFX = nil

                local okShock, errShock = pcall(function()
                    shockFX = Particle(
                        strikeLoc + Vector(0, 0, 8),
                        verticalRot,
                        SHOCK_TRIANGLE_FX,
                        false,
                        true
                    )
                end)

                if not okShock or not shockFX then
                    Console.Log("Erreur P_Shock_Triangle_01 : " .. tostring(errShock))
                else
                    pcall(function()
                        shockFX:SetRotation(verticalRot)
                    end)
                end

                ------------------------------------------------
                -- SON + LAND_SMOKE + TREMBLEMENT AU PREMIER P_LightningShot
                ------------------------------------------------
                if firstStrike then
                    firstStrike = false

                    ------------------------------------------------
                    -- PARTICULE LAND_SMOKE AU MILIEU DE LA ZONE
                    -- Apparaît au même moment que la première P_LightningShot
                    ------------------------------------------------
                    local landSmokeFX = nil

                    local okSmoke, errSmoke = pcall(function()
                        landSmokeFX = Particle(
                            stormCenter + Vector(0, 0, 8),
                            Rotator(0, 0, 0),
                            LAND_SMOKE_FX,
                            false,
                            true
                        )
                    end)

                    if not okSmoke or not landSmokeFX then
                        Console.Log("Erreur Land_Smoke : " .. tostring(errSmoke))
                    else
                        pcall(function()
                            landSmokeFX:SetScale(Vector(2.5, 2.5, 2.5))
                        end)

                        Timer.SetTimeout(function()
                            if landSmokeFX then
                                pcall(function()
                                    landSmokeFX:Destroy()
                                end)

                                landSmokeFX = nil
                            end
                        end, 1800)
                    end

                    ------------------------------------------------
                    -- SON FOUDRE
                    ------------------------------------------------
                    local okSound, errSound = pcall(function()
                        Sound(
                            strikeLoc + Vector(0, 0, 80),
                            LIGHTNING_SOUND,
                            false,
                            true,
                            SoundType.SFX,
                            2.0,
                            1.0,
                            300,
                            2500
                        )
                    end)

                    if not okSound then
                        Console.Log("Erreur son foudre_ : " .. tostring(errSound))
                    end

                    ------------------------------------------------
                    -- TREMBLEMENT DE CAMÉRA
                    ------------------------------------------------
                    pcall(function()
                        if Events and Events.CallRemote and caster then
                            Events.CallRemote(
                                "FoudreOrageCameraShake",
                                caster,
                                5.0,
                                420,
                                12
                            )
                        end
                    end)
                end

                ------------------------------------------------
                -- HITBOX DE CETTE FRAPPE
                -- SI LA CIBLE EST TOUCHÉE = 10 DÉGÂTS EN PLUS
                ------------------------------------------------
                local hitBox = nil

                local okTrigger, errTrigger = pcall(function()
                    hitBox = Trigger(
                        strikeLoc,
                        Rotator(0, 0, 0),
                        strikeRadius,
                        TriggerType.Sphere,
                        true,
                        Color.RED,
                        { "Character", "CharacterSimple" }
                    )
                end)

                if not okTrigger or not hitBox then
                    Console.Log("Erreur hitbox frappe foudre : " .. tostring(errTrigger))
                end

                local alreadyHitThisStrike = {}

                if hitBox then
                    hitBox:Subscribe("BeginOverlap", function(selfTrigger, entity)
                        if not entity then return end
                        if entity == char then return end
                        if alreadyHitThisStrike[entity] then return end

                        alreadyHitThisStrike[entity] = true

                        sp:OnHit(caster, entity, strikeLoc)
                    end)
                end

                ------------------------------------------------
                -- DESTRUCTION DE LA FRAPPE
                ------------------------------------------------
                Timer.SetTimeout(function()
                    if hitBox then
                        pcall(function()
                            hitBox:Destroy()
                        end)

                        hitBox = nil
                    end

                    if lightningFX then
                        pcall(function()
                            lightningFX:Destroy()
                        end)

                        lightningFX = nil
                    end

                    if shockFX then
                        pcall(function()
                            shockFX:Destroy()
                        end)

                        shockFX = nil
                    end
                end, 450)

                ------------------------------------------------
                -- FIN DES FRAPPES
                ------------------------------------------------
                if strikeCount >= maxStrikes then
                    if stormInterval then
                        pcall(function()
                            Timer.ClearInterval(stormInterval)
                        end)

                        stormInterval = nil
                    end
                end
            end

            ----------------------------------------------------
            -- PREMIÈRE FRAPPE DIRECTEMENT
            ----------------------------------------------------
            SpawnRandomLightningStrike()

            ----------------------------------------------------
            -- FRAPPES ALÉATOIRES DANS LA ZONE
            ----------------------------------------------------
            stormInterval = Timer.SetInterval(function()
                SpawnRandomLightningStrike()
            end, strikeIntervalMs)

            ----------------------------------------------------
            -- DESTRUCTION FINALE DE L'ORAGE
            ----------------------------------------------------
            Timer.SetTimeout(function()
                if stormInterval then
                    pcall(function()
                        Timer.ClearInterval(stormInterval)
                    end)

                    stormInterval = nil
                end

                if zoneDamageInterval then
                    pcall(function()
                        Timer.ClearInterval(zoneDamageInterval)
                    end)

                    zoneDamageInterval = nil
                end

                if zoneDamageTrigger then
                    pcall(function()
                        zoneDamageTrigger:Destroy()
                    end)

                    zoneDamageTrigger = nil
                end

                entitiesInsideZone = {}

                if cloudFX then
                    pcall(function()
                        cloudFX:Destroy()
                    end)

                    cloudFX = nil
                end

                if zoneFX then
                    pcall(function()
                        zoneFX:Destroy()
                    end)

                    zoneFX = nil
                end

                FoudreOrageAimState[caster] = nil

                Console.Log("Foudre frappante : orage terminé")
            end, stormDuration)

        end, 767)
    end,
})

------------------------------------------------------------
-- METEOR ENFLAMMER - VERSION DRAGON LEE ANIMSET
-- MODIFS :
-- AM_cooupoint : les 2 partent en l'air à la frame 7
-- AM_cooupoint : premier dégât à la frame 30
-- AM_cooupied  : ennemi propulsé au sol à la frame 22
-- Joueur moins haut au-dessus de l'ennemi
------------------------------------------------------------

------------------------------------------------------------
-- CONFIG ASSETS
------------------------------------------------------------
local PUNCH_ANIM = "dragon-lee-animset::AM_cooupoint"
local KICK_ANIM  = "dragon-lee-animset::AM_cooupied"

local SMOKE_FX = "simple-cartoon-fx::Land_Smoke"

local FIRE_TARGET_IMPACT_FX = "ultimate-elementsvfx::NS_Ultimate_Fire_TargetImpactHuge"
local ENEMY_BACK_SOCKET = "spine_03"

------------------------------------------------------------
-- CONFIG SPELL
------------------------------------------------------------
local PUNCH_DAMAGE = 10
local KICK_DAMAGE  = 50

local HITBOX_RADIUS = 180
local HITBOX_FORWARD_OFFSET = 140
local HITBOX_HEIGHT_OFFSET = 90

local AIR_HEIGHT = 950

-- Plus ce nombre est haut, plus le joueur est au-dessus de l'ennemi.
-- Avant c'était 120, donc trop haut.
local CASTER_EXTRA_HEIGHT = 40

local SMALL_GAP = 45

------------------------------------------------------------
-- TIMINGS À 30 FPS
------------------------------------------------------------
local FPS = 30

local function FrameToMs(frame)
    return math.floor((frame / FPS) * 1000)
end

local PUNCH_LIFT_FRAME_MS   = FrameToMs(7)
local PUNCH_DAMAGE_FRAME_MS = FrameToMs(30)
local KICK_SLAM_FRAME_MS    = FrameToMs(22)

------------------------------------------------------------
-- MOUVEMENT
------------------------------------------------------------
local LIFT_TIME = 0.75
local ENEMY_SLAM_TIME = 0.45
local CASTER_DOWN_TIME = 0.90
local CASTER_EXTRA_HOLD_MS = 1000

------------------------------------------------------------
-- ANTI FALL DAMAGE FLAG
------------------------------------------------------------
AIR_COMBO_NO_FALL_DAMAGE = AIR_COMBO_NO_FALL_DAMAGE or {}

------------------------------------------------------------
-- UTILS
------------------------------------------------------------
local function NormalizeVector(v)
    if not v then return Vector(1, 0, 0) end

    local len = math.sqrt((v.X * v.X) + (v.Y * v.Y) + (v.Z * v.Z))

    if len <= 0.0001 then
        return Vector(1, 0, 0)
    end

    return Vector(v.X / len, v.Y / len, v.Z / len)
end

local function GetRightFromForward(forward)
    forward = NormalizeVector(forward)
    return NormalizeVector(Vector(forward.Y, -forward.X, 0))
end

local function SafeGetLocation(entity)
    local loc = nil

    pcall(function()
        loc = entity:GetLocation()
    end)

    return loc
end

local function SafeGetRotation(entity)
    local rot = nil

    pcall(function()
        rot = entity:GetRotation()
    end)

    if not rot then
        rot = Rotator(0, 0, 0)
    end

    return rot
end

local function SafeSetLocation(entity, loc)
    if not entity or not loc then return end

    pcall(function()
        entity:SetLocation(loc)
    end)
end

local function SafeSetVelocity(entity, velocity)
    if not entity then return end

    pcall(function()
        entity:SetVelocity(velocity)
    end)
end

local function SafeTranslateTo(entity, loc, time, exp)
    if not entity or not loc then return end

    pcall(function()
        entity:TranslateTo(loc, time, exp or 0)
    end)
end

local function SafeSetGravity(entity, enabled)
    if not entity then return end

    local ok, err = pcall(function()
        entity:SetGravityEnabled(enabled)
    end)

    if not ok then
        Console.Log("Erreur SetGravityEnabled(" .. tostring(enabled) .. ") : " .. tostring(err))
    else
        Console.Log("Gravity " .. tostring(enabled) .. " appliquée")
    end
end

local function ClearIntervalSafe(interval)
    if not interval then return end

    pcall(function()
        Timer.ClearInterval(interval)
    end)
end

local function SafeApplyDamage(entity, amount)
    if not entity then return end

    local ok, err = pcall(function()
        entity:ApplyDamage(amount)
    end)

    if not ok then
        Console.Log("Erreur ApplyDamage : " .. tostring(err))
    end
end

------------------------------------------------------------
-- CAMERA SHAKE AU SOL
------------------------------------------------------------
local function TriggerGroundImpactCameraShake(caster)
    pcall(function()
        if Events and Events.CallRemote and caster then
            Events.CallRemote(
                "FoudreOrageCameraShake",
                caster,
                6.5,
                500,
                10
            )
        end
    end)
end

------------------------------------------------------------
-- STOP ANIMATION
------------------------------------------------------------
local function StopAnim(char)
    if not char then return end

    pcall(function()
        char:StopAnimation()
    end)
end

------------------------------------------------------------
-- PLAY MONTAGE SIMPLE
------------------------------------------------------------
local function PlayMontageSimple(char, animRef, logName)
    if not char then return false end

    local ok, err = pcall(function()
        char:PlayAnimation(animRef)
    end)

    if not ok then
        Console.Log("Erreur PlayAnimation " .. tostring(logName) .. " : " .. tostring(err))
        return false
    end

    Console.Log(tostring(logName) .. " lancé")
    return true
end

local function PlayPunchAnim(char)
    return PlayMontageSimple(char, PUNCH_ANIM, "AM_cooupoint")
end

local function PlayKickAnim(char)
    return PlayMontageSimple(char, KICK_ANIM, "AM_cooupied")
end

------------------------------------------------------------
-- PROTECTION CHUTE
------------------------------------------------------------
local function StopFallDamageVelocity(entity, durationMs)
    if not entity then return end

    AIR_COMBO_NO_FALL_DAMAGE[entity] = true

    local startTime = os.clock()
    local interval = nil

    interval = Timer.SetInterval(function()
        local elapsedMs = (os.clock() - startTime) * 1000

        if elapsedMs >= durationMs then
            AIR_COMBO_NO_FALL_DAMAGE[entity] = nil

            ClearIntervalSafe(interval)
            interval = nil
            return
        end

        SafeSetVelocity(entity, Vector(0, 0, 0))
    end, 30)
end

------------------------------------------------------------
-- HOLD EN L'AIR
------------------------------------------------------------
local function HoldEntityInAir(entity, holdLoc, durationMs)
    if not entity or not holdLoc then return nil end

    local startTime = os.clock()
    local holdInterval = nil

    holdInterval = Timer.SetInterval(function()
        local elapsedMs = (os.clock() - startTime) * 1000

        if elapsedMs >= durationMs then
            ClearIntervalSafe(holdInterval)
            holdInterval = nil

            SafeSetVelocity(entity, Vector(0, 0, 0))
            return
        end

        SafeSetLocation(entity, holdLoc)
        SafeSetVelocity(entity, Vector(0, 0, 0))
    end, 20)

    return holdInterval
end

------------------------------------------------------------
-- SMOKE
------------------------------------------------------------
local function SpawnSmokeAtLocation(loc)
    if not loc then return end

    local smokeFX = nil

    local okSmoke, errSmoke = pcall(function()
        smokeFX = Particle(
            loc + Vector(0, 0, 10),
            Rotator(0, 0, 0),
            SMOKE_FX,
            false,
            true
        )
    end)

    if not okSmoke or not smokeFX then
        Console.Log("Erreur particule fumée : " .. tostring(errSmoke))
        return
    end

    pcall(function()
        smokeFX:SetScale(Vector(2.4, 2.4, 2.4))
    end)

    Timer.SetTimeout(function()
        if smokeFX then
            pcall(function()
                smokeFX:Destroy()
            end)

            smokeFX = nil
        end
    end, 1600)
end

------------------------------------------------------------
-- FX TRACKER
------------------------------------------------------------
local function DestroyTrackedFX(tracker)
    if not tracker then return end

    if tracker.interval then
        ClearIntervalSafe(tracker.interval)
        tracker.interval = nil
    end

    if tracker.fx then
        pcall(function()
            tracker.fx:Destroy()
        end)

        tracker.fx = nil
    end
end

------------------------------------------------------------
-- FIRE TARGET IMPACT HUGE ACCROCHÉ AU DOS DE L'ENNEMI
------------------------------------------------------------
local function SpawnFireImpactHugeOnEnemyBack(victim)
    if not victim then return nil end

    local loc = SafeGetLocation(victim)
    local rot = SafeGetRotation(victim)

    if not loc then return nil end

    local impactFX = nil

    local okImpact, errImpact = pcall(function()
        impactFX = Particle(
            loc,
            rot,
            FIRE_TARGET_IMPACT_FX,
            false,
            true
        )
    end)

    if not okImpact or not impactFX then
        Console.Log("Erreur NS_Ultimate_Fire_TargetImpactHuge : " .. tostring(errImpact))
        return nil
    end

    pcall(function()
        impactFX:SetScale(Vector(0.5, 0.5, 0.5))
    end)

    local attached = false

    local okAttach, errAttach = pcall(function()
        attached = impactFX:AttachTo(
            victim,
            AttachmentRule.SnapToTarget,
            ENEMY_BACK_SOCKET,
            -1,
            false
        )
    end)

    if not okAttach or not attached then
        Console.Log("Erreur AttachTo dos ennemi " .. tostring(ENEMY_BACK_SOCKET) .. " : " .. tostring(errAttach))

        local forward = NormalizeVector(rot:GetForwardVector())
        local backLoc = loc - forward * 45 + Vector(0, 0, 105)

        pcall(function()
            impactFX:SetLocation(backLoc)
            impactFX:SetRotation(rot)
        end)
    else
        Console.Log("NS_Ultimate_Fire_TargetImpactHuge attachée au dos : " .. tostring(ENEMY_BACK_SOCKET))
    end

    pcall(function()
        impactFX:SetRelativeLocation(Vector(0, 0, 0))
        impactFX:SetRelativeRotation(Rotator(0, 0, 0))
    end)

    local tracker = {
        fx = impactFX,
        interval = nil
    }

    return tracker
end

------------------------------------------------------------
-- REGISTER SPELL
------------------------------------------------------------
SpellRegistry.Register({
    id       = "air_punch_kick",
    name     = "Meteor enflammer",
    desc     = "Punch l'ennemi en l'air puis le renvoie au sol avec un kick.",
    clan     = "feu",
    category = "Hériditaire",
    type     = "attack",

    damage      = PUNCH_DAMAGE,
    kick_damage = KICK_DAMAGE,

    cost     = 25,
    cooldown = 4,
    rang     = "C",
    range    = 450,
    iconUrl  = "https://i.pinimg.com/736x/2a/26/77/2a26779894a9ded712062dd9d88d75ee.jpg",

    Cast = function(sp, caster, data)
        local char = GetValidChar(caster)
        if not char then return end

        local charLoc = SafeGetLocation(char)
        local charRot = SafeGetRotation(char)

        if not charLoc then return end

        local forward = NormalizeVector(charRot:GetForwardVector())

        ----------------------------------------------------
        -- HITBOX DEVANT LE JOUEUR
        ----------------------------------------------------
        local hitBox = nil
        local hitBoxLoc = charLoc + forward * HITBOX_FORWARD_OFFSET + Vector(0, 0, HITBOX_HEIGHT_OFFSET)

        local okTrigger, errTrigger = pcall(function()
            hitBox = Trigger(
                hitBoxLoc,
                charRot,
                HITBOX_RADIUS,
                TriggerType.Sphere,
                true,
                Color.RED,
                { "Character", "CharacterSimple" }
            )
        end)

        if not okTrigger or not hitBox then
            Console.Log("Erreur hitbox Meteor enflammer : " .. tostring(errTrigger))
            return
        end

        local alreadyTriggered = false

        local followInterval = nil
        local followStartTime = os.clock()
        local followDuration = 0.65

        ----------------------------------------------------
        -- HITBOX QUI SUIT LE JOUEUR
        ----------------------------------------------------
        followInterval = Timer.SetInterval(function()
            if not hitBox then return end

            local currentLoc = SafeGetLocation(char)
            local currentRot = SafeGetRotation(char)

            if not currentLoc then return end

            local currentForward = NormalizeVector(currentRot:GetForwardVector())
            local newHitBoxLoc = currentLoc + currentForward * HITBOX_FORWARD_OFFSET + Vector(0, 0, HITBOX_HEIGHT_OFFSET)

            pcall(function()
                hitBox:SetLocation(newHitBoxLoc)
                hitBox:SetRotation(currentRot)
            end)

            if (os.clock() - followStartTime) >= followDuration then
                ClearIntervalSafe(followInterval)
                followInterval = nil
            end
        end, 10)

        ----------------------------------------------------
        -- QUAND LA HITBOX TOUCHE UNE CIBLE
        ----------------------------------------------------
        hitBox:Subscribe("BeginOverlap", function(selfTrigger, victim)
            if alreadyTriggered then return end
            if not victim then return end
            if victim == char then return end

            alreadyTriggered = true

            ClearIntervalSafe(followInterval)
            followInterval = nil

            if hitBox then
                pcall(function()
                    hitBox:Destroy()
                end)

                hitBox = nil
            end

            Console.Log("Meteor enflammer : cible touchée")

            ------------------------------------------------
            -- LANCE AM_cooupoint
            ------------------------------------------------
            local animStarted = PlayPunchAnim(char)
            if not animStarted then return end

            ------------------------------------------------
            -- FRAME 30 DE AM_cooupoint : PREMIER DÉGÂT
            ------------------------------------------------
            Timer.SetTimeout(function()
                SafeApplyDamage(victim, sp.damage or PUNCH_DAMAGE)
                Console.Log("Meteor enflammer : frame 30 AM_cooupoint, premier dégât appliqué")
            end, PUNCH_DAMAGE_FRAME_MS)

            ------------------------------------------------
            -- FRAME 7 DE AM_cooupoint : LES 2 PARTENT EN L'AIR
            ------------------------------------------------
            Timer.SetTimeout(function()
                local casterGroundLoc = SafeGetLocation(char)
                local victimGroundLoc = SafeGetLocation(victim)
                local casterRotNow = SafeGetRotation(char)

                if not casterGroundLoc or not victimGroundLoc then return end

                local comboForward = NormalizeVector(casterRotNow:GetForwardVector())
                local comboRight = GetRightFromForward(comboForward)

                ------------------------------------------------
                -- POSITIONS EN L'AIR
                ------------------------------------------------
                local casterAirLoc = Vector(
                    casterGroundLoc.X - comboRight.X * SMALL_GAP,
                    casterGroundLoc.Y - comboRight.Y * SMALL_GAP,
                    casterGroundLoc.Z + AIR_HEIGHT + CASTER_EXTRA_HEIGHT
                )

                local victimAirLoc = Vector(
                    victimGroundLoc.X + comboRight.X * SMALL_GAP,
                    victimGroundLoc.Y + comboRight.Y * SMALL_GAP,
                    victimGroundLoc.Z + AIR_HEIGHT
                )

                ------------------------------------------------
                -- COUPE GRAVITÉ
                ------------------------------------------------
                SafeSetVelocity(char, Vector(0, 0, 0))
                SafeSetVelocity(victim, Vector(0, 0, 0))

                SafeSetGravity(char, false)
                SafeSetGravity(victim, false)

                StopFallDamageVelocity(char, 9000)
                StopFallDamageVelocity(victim, 9000)

                ------------------------------------------------
                -- LES 2 MONTENT EN L'AIR
                ------------------------------------------------
                Console.Log("Meteor enflammer : frame 7 AM_cooupoint, montée en l'air")

                SafeTranslateTo(char, casterAirLoc, LIFT_TIME, 0)
                SafeTranslateTo(victim, victimAirLoc, LIFT_TIME, 0)

                ------------------------------------------------
                -- DÈS QU'ILS SONT EN L'AIR : AM_cooupied
                ------------------------------------------------
                Timer.SetTimeout(function()
                    SafeSetLocation(char, casterAirLoc)
                    SafeSetLocation(victim, victimAirLoc)

                    SafeSetVelocity(char, Vector(0, 0, 0))
                    SafeSetVelocity(victim, Vector(0, 0, 0))

                    PlayKickAnim(char)

                    ------------------------------------------------
                    -- MAINTIEN EN L'AIR
                    ------------------------------------------------
                    local casterHold = HoldEntityInAir(
                        char,
                        casterAirLoc,
                        KICK_SLAM_FRAME_MS + CASTER_EXTRA_HOLD_MS + 500
                    )

                    local victimHold = HoldEntityInAir(
                        victim,
                        victimAirLoc,
                        KICK_SLAM_FRAME_MS + 300
                    )

                    ------------------------------------------------
                    -- FRAME 22 DE AM_cooupied : ENNEMI ENVOYÉ AU SOL
                    ------------------------------------------------
                    Timer.SetTimeout(function()
                        ClearIntervalSafe(victimHold)
                        victimHold = nil

                        SafeSetLocation(victim, victimAirLoc)
                        SafeSetVelocity(victim, Vector(0, 0, 0))

                        ------------------------------------------------
                        -- DÉGÂTS AM_cooupied = 50
                        ------------------------------------------------
                        SafeApplyDamage(victim, sp.kick_damage or KICK_DAMAGE)

                        Console.Log("Meteor enflammer : frame 22 AM_cooupied, ennemi envoyé au sol")

                        ------------------------------------------------
                        -- FX FEU AU DOS
                        ------------------------------------------------
                        local enemyBackFireFX = SpawnFireImpactHugeOnEnemyBack(victim)

                        ------------------------------------------------
                        -- GRAVITÉ ON POUR L'ENNEMI
                        ------------------------------------------------
                        SafeSetGravity(victim, true)

                        ------------------------------------------------
                        -- PROPULSION AU SOL
                        ------------------------------------------------
                        local victimSlamLoc = Vector(
                            victimGroundLoc.X + comboForward.X * 150,
                            victimGroundLoc.Y + comboForward.Y * 150,
                            victimGroundLoc.Z + 35
                        )

                        SafeSetVelocity(victim, Vector(0, 0, 0))
                        SafeTranslateTo(victim, victimSlamLoc, ENEMY_SLAM_TIME, 0)

                        Timer.SetTimeout(function()
                            SafeSetLocation(victim, victimSlamLoc)
                            SafeSetVelocity(victim, Vector(0, 0, 0))

                            ------------------------------------------------
                            -- Fire_TargetImpactHuge disparaît quand l'ennemi touche le sol
                            ------------------------------------------------
                            DestroyTrackedFX(enemyBackFireFX)
                            enemyBackFireFX = nil

                            StopFallDamageVelocity(victim, 3000)

                            ------------------------------------------------
                            -- FUMÉE À L'IMPACT
                            ------------------------------------------------
                            SpawnSmokeAtLocation(victimSlamLoc)

                            ------------------------------------------------
                            -- TREMBLEMENT DE CAMÉRA À L'IMPACT AU SOL
                            ------------------------------------------------
                            TriggerGroundImpactCameraShake(caster)

                            Console.Log("Meteor enflammer : ennemi au sol + fumée + tremblement caméra + FX supprimé")
                        end, math.floor(ENEMY_SLAM_TIME * 1000) + 80)

                        ------------------------------------------------
                        -- LE CASTER RESTE EN L'AIR 1 SECONDE APRÈS LE SLAM
                        ------------------------------------------------
                        Timer.SetTimeout(function()
                            ClearIntervalSafe(casterHold)
                            casterHold = nil

                            SafeSetGravity(char, true)

                            local casterDownLoc = Vector(
                                casterGroundLoc.X,
                                casterGroundLoc.Y,
                                casterGroundLoc.Z + 35
                            )

                            SafeSetVelocity(char, Vector(0, 0, 0))
                            SafeTranslateTo(char, casterDownLoc, CASTER_DOWN_TIME, 0)

                            Timer.SetTimeout(function()
                                SafeSetLocation(char, casterDownLoc)
                                SafeSetVelocity(char, Vector(0, 0, 0))

                                StopFallDamageVelocity(char, 2500)

                                StopAnim(char)

                                Console.Log("Meteor enflammer : caster redescendu, gravité ON")
                            end, math.floor(CASTER_DOWN_TIME * 1000) + 80)
                        end, CASTER_EXTRA_HOLD_MS)

                    end, KICK_SLAM_FRAME_MS)

                end, math.floor(LIFT_TIME * 1000) + 80)

            end, PUNCH_LIFT_FRAME_MS)
        end)

        ----------------------------------------------------
        -- SI PERSONNE N'EST TOUCHÉ
        ----------------------------------------------------
        Timer.SetTimeout(function()
            ClearIntervalSafe(followInterval)
            followInterval = nil

            if hitBox then
                pcall(function()
                    hitBox:Destroy()
                end)

                hitBox = nil
            end

            if not alreadyTriggered then
                SafeSetGravity(char, true)
                Console.Log("Meteor enflammer : aucun hit, aucun AM_cooupoint lancé")
            end
        end, 900)
    end,
})

------------------------------------------------------------
-- COUP DE PIED ENFLAMMER — état partagé
------------------------------------------------------------
COUP_PIED_ENFLAMMER_CAMERA_SHAKE_REGISTERED = COUP_PIED_ENFLAMMER_CAMERA_SHAKE_REGISTERED or false
COUP_PIED_STUNNED_TARGETS = COUP_PIED_STUNNED_TARGETS or {}

------------------------------------------------------------
-- ASSETS
------------------------------------------------------------
local COUP_PIED_ANIM = "dragon-lee-animset::AM_spellfeukick"
local FIRE_KICK_FX   = "2d-anime-fx::P_Spell_03_Converted"

------------------------------------------------------------
-- RÉGLAGES
------------------------------------------------------------
local FPS = 30

local FRAME_6_DAMAGE  = 6
local FRAME_17_DAMAGE = 17
local FRAME_FIRE_FX   = 30
local FRAME_SHAKE     = 38

local KICK_DAMAGE = 10
local FIRE_DAMAGE = 30

local KICK_DISTANCE = 150
local KICK_RADIUS   = 165

local FIRE_DISTANCE = 230
local FIRE_RADIUS   = 235

local KNOCKBACK_DISTANCE = 650
local KNOCKBACK_UP       = 120
local KNOCKBACK_TIME     = 0.20

-- Stun au premier dégât reçu
local FIRST_HIT_STUN_DURATION_MS = 1000
local FIRST_HIT_STUN_INTERVAL_MS = 25

------------------------------------------------------------
-- UTILS
------------------------------------------------------------
local function FrameToMs(frame)
    return math.floor((frame / FPS) * 1000)
end

local function NormalizeVector(v)
    if not v then return Vector(1, 0, 0) end

    local len = math.sqrt((v.X * v.X) + (v.Y * v.Y) + (v.Z * v.Z))
    if len <= 0.0001 then
        return Vector(1, 0, 0)
    end

    return Vector(v.X / len, v.Y / len, v.Z / len)
end

local function SafeDestroy(entity)
    if entity then
        pcall(function()
            entity:Destroy()
        end)
    end
end

local function SafeDamage(entity, amount)
    if not entity then return end

    local ok, err = pcall(function()
        entity:ApplyDamage(amount)
    end)

    if not ok then
        Console.Log("Coup de pied enflammer : erreur ApplyDamage : " .. tostring(err))
    end
end

local function GetCharLocRot(char)
    if not char then return nil, nil end

    local loc, rot = nil, nil

    pcall(function()
        loc = char:GetLocation()
        rot = char:GetRotation()
    end)

    if not rot then
        rot = Rotator(0, 0, 0)
    end

    return loc, rot
end

------------------------------------------------------------
-- STUN / BLOQUE UNE CIBLE 2 SECONDES
------------------------------------------------------------
local function StunTarget(entity, durationMs)
    if not entity then return end

    durationMs = durationMs or FIRST_HIT_STUN_DURATION_MS

    -- Évite de lancer plusieurs stuns en même temps sur la même cible
    if COUP_PIED_STUNNED_TARGETS[entity] then
        return
    end

    COUP_PIED_STUNNED_TARGETS[entity] = true

    local stunLoc = nil
    local stunRot = nil

    pcall(function()
        stunLoc = entity:GetLocation()
        stunRot = entity:GetRotation()
    end)

    if not stunLoc then
        COUP_PIED_STUNNED_TARGETS[entity] = nil
        return
    end

    if not stunRot then
        stunRot = Rotator(0, 0, 0)
    end

    local stunInterval = nil
    local startTime = os.clock()

    stunInterval = Timer.SetInterval(function()
        local elapsedMs = (os.clock() - startTime) * 1000

        if elapsedMs >= durationMs then
            if stunInterval then
                pcall(function()
                    Timer.ClearInterval(stunInterval)
                end)

                stunInterval = nil
            end

            pcall(function()
                entity:SetVelocity(Vector(0, 0, 0))
            end)

            COUP_PIED_STUNNED_TARGETS[entity] = nil

            Console.Log("Coup de pied enflammer : stun terminé")
            return
        end

        -- Bloque la cible à sa position
        pcall(function()
            entity:SetVelocity(Vector(0, 0, 0))
        end)

        pcall(function()
            entity:SetLocation(stunLoc)
        end)

        pcall(function()
            entity:SetRotation(stunRot)
        end)
    end, FIRST_HIT_STUN_INTERVAL_MS)

    Console.Log("Coup de pied enflammer : cible stun pendant 2 secondes")
end

------------------------------------------------------------
-- CAMERA SHAKE CLIENT
------------------------------------------------------------
local function StartCoupPiedEnflammerCameraShake(intensity, durationMs, intervalMs)
    intensity  = tonumber(intensity)  or 5.5
    durationMs = tonumber(durationMs) or 420
    intervalMs = tonumber(intervalMs) or 12

    if not Client or not Client.GetLocalPlayer then return end
    if not Timer or not Timer.SetInterval then return end

    local localPlayer = nil
    pcall(function()
        localPlayer = Client.GetLocalPlayer()
    end)

    if not localPlayer then return end

    local baseRot = nil
    pcall(function()
        baseRot = localPlayer:GetCameraRotation()
    end)

    if not baseRot then return end

    local startTime = os.clock()
    local shakeInterval = nil

    shakeInterval = Timer.SetInterval(function()
        local elapsedMs = (os.clock() - startTime) * 1000

        if elapsedMs >= durationMs then
            if shakeInterval then
                pcall(function()
                    Timer.ClearInterval(shakeInterval)
                end)
                shakeInterval = nil
            end

            pcall(function()
                localPlayer:SetCameraRotation(baseRot)
            end)

            return
        end

        local power = 1.0 - (elapsedMs / durationMs)

        local pitchOffset = ((math.random() * 2.0) - 1.0) * intensity * power
        local yawOffset   = ((math.random() * 2.0) - 1.0) * intensity * power
        local rollOffset  = ((math.random() * 2.0) - 1.0) * intensity * 0.35 * power

        pcall(function()
            localPlayer:SetCameraRotation(Rotator(
                baseRot.Pitch + pitchOffset,
                baseRot.Yaw   + yawOffset,
                baseRot.Roll  + rollOffset
            ))
        end)
    end, intervalMs)
end

if not COUP_PIED_ENFLAMMER_CAMERA_SHAKE_REGISTERED and Events and Events.SubscribeRemote then
    COUP_PIED_ENFLAMMER_CAMERA_SHAKE_REGISTERED = true

    Events.SubscribeRemote("CoupPiedEnflammerCameraShake", function(intensity, durationMs, intervalMs)
        StartCoupPiedEnflammerCameraShake(intensity, durationMs, intervalMs)
    end)
end

------------------------------------------------------------
-- DÉGÂTS DEVANT LE JOUEUR
------------------------------------------------------------
local function DoFrontDamage(casterChar, damage, distance, radius, lifeMs, debugName, onHitCallback)
    if not casterChar then return end

    local loc, rot = GetCharLocRot(casterChar)
    if not loc or not rot then return end

    local forward = NormalizeVector(rot:GetForwardVector())
    local hitLoc  = loc + forward * distance + Vector(0, 0, 85)

    local hitBox = nil
    local okTrigger, errTrigger = pcall(function()
        hitBox = Trigger(
            hitLoc,
            rot,
            radius,
            TriggerType.Sphere,
            true,
            Color.RED,
            { "Character", "CharacterSimple" }
        )
    end)

    if not okTrigger or not hitBox then
        Console.Log("Coup de pied enflammer : erreur hitbox " .. tostring(debugName) .. " : " .. tostring(errTrigger))
        return
    end

    local alreadyHit = {}

    hitBox:Subscribe("BeginOverlap", function(_, entity)
        if not entity then return end
        if entity == casterChar then return end
        if alreadyHit[entity] then return end

        alreadyHit[entity] = true

        SafeDamage(entity, damage)

        if onHitCallback then
            pcall(function()
                onHitCallback(entity)
            end)
        end

        Console.Log(
            "Coup de pied enflammer : " ..
            tostring(debugName) ..
            " touche pour " ..
            tostring(damage) ..
            " dégâts"
        )
    end)

    Timer.SetTimeout(function()
        SafeDestroy(hitBox)
        hitBox = nil
    end, lifeMs or 160)
end

------------------------------------------------------------
-- PARTICULE FEU FRAME 30
------------------------------------------------------------
local function SpawnFireKickParticle(casterChar, touchedByFire, onFirstDamageCallback)
    if not casterChar then return end

    local loc, rot = GetCharLocRot(casterChar)
    if not loc or not rot then return end

    local forward = NormalizeVector(rot:GetForwardVector())
    local fxLoc   = loc + forward * FIRE_DISTANCE + Vector(0, 0, 30)

    local fireFX = nil
    local okFX, errFX = pcall(function()
        fireFX = Particle(
            fxLoc,
            rot,
            FIRE_KICK_FX,
            false,
            true
        )
    end)

    if not okFX or not fireFX then
        Console.Log("Coup de pied enflammer : erreur P_Spell_03_Converted : " .. tostring(errFX))
    else
        pcall(function()
            fireFX:SetScale(Vector(1.0, 1.0, 1.0))
        end)

        Timer.SetTimeout(function()
            SafeDestroy(fireFX)
            fireFX = nil
        end, 1200)
    end

    DoFrontDamage(
        casterChar,
        FIRE_DAMAGE,
        FIRE_DISTANCE,
        FIRE_RADIUS,
        260,
        "P_Spell_03_Converted",
        function(entity)
            touchedByFire[entity] = true

            if onFirstDamageCallback then
                onFirstDamageCallback(entity)
            end
        end
    )
end

------------------------------------------------------------
-- PROPULSION FRAME 38
------------------------------------------------------------
local function KnockbackFireTargets(casterChar, touchedByFire)
    if not casterChar or not touchedByFire then return end

    local casterLoc, casterRot = GetCharLocRot(casterChar)
    if not casterLoc or not casterRot then return end

    local forward = NormalizeVector(casterRot:GetForwardVector())

    for enemy, _ in pairs(touchedByFire) do
        if enemy and enemy ~= casterChar then
            local enemyLoc = nil

            pcall(function()
                enemyLoc = enemy:GetLocation()
            end)

            if enemyLoc then
                local impulse = forward * 1350 + Vector(0, 0, KNOCKBACK_UP)

                local okImpulse = pcall(function()
                    enemy:AddImpulse(impulse, true)
                end)

                if not okImpulse then
                    local targetLoc = enemyLoc + forward * KNOCKBACK_DISTANCE + Vector(0, 0, KNOCKBACK_UP)

                    pcall(function()
                        enemy:TranslateTo(targetLoc, KNOCKBACK_TIME, 0)
                    end)
                end

                Console.Log("Coup de pied enflammer : ennemi propulsé à la frame 38")
            end
        end
    end
end

------------------------------------------------------------
-- SPELL : COUP DE PIED ENFLAMMER
------------------------------------------------------------
SpellRegistry.Register({
    id       = "coup_de_pied_enflammer",
    name     = "Coup de pied enflammer",
    desc     = "Lance un combo de coups de pied enflammés.",
    clan     = "feu",
    category = "Hériditaire",
    type     = "attack",

    damage      = KICK_DAMAGE,
    fire_damage = FIRE_DAMAGE,

    cost     = 25,
    cooldown = 4,
    rang     = "B",
    range    = 500,
    iconUrl  = "https://i.pinimg.com/736x/05/e8/ba/05e8bad90eb678569c6dbcde4ed823f0.jpg",

    Cast = function(sp, caster, data)
        local char = GetValidChar(caster)
        if not char then return end

        local touchedByFire = {}

        -- Cette table fait que chaque ennemi est stun seulement au premier dégât reçu pendant ce cast
        local stunnedOnFirstDamage = {}

        local function StunOnFirstDamage(entity)
            if not entity then return end
            if stunnedOnFirstDamage[entity] then return end

            stunnedOnFirstDamage[entity] = true
            StunTarget(entity, FIRST_HIT_STUN_DURATION_MS)
        end

        ----------------------------------------------------
        -- Lance le montage
        ----------------------------------------------------
        local okAnim, errAnim = pcall(function()
            char:PlayAnimation(COUP_PIED_ANIM)
        end)

        if not okAnim then
            Console.Log("Coup de pied enflammer : erreur PlayAnimation : " .. tostring(errAnim))
            return
        end

        Console.Log("Coup de pied enflammer : AM_spellfeukick lancé")

        ----------------------------------------------------
        -- FRAME 6 : 10 dégâts + stun si c'est le premier dégât
        ----------------------------------------------------
        Timer.SetTimeout(function()
            local liveChar = GetValidChar(caster)
            if not liveChar then return end

            DoFrontDamage(
                liveChar,
                KICK_DAMAGE,
                KICK_DISTANCE,
                KICK_RADIUS,
                170,
                "frame 6",
                function(entity)
                    StunOnFirstDamage(entity)
                end
            )

            Console.Log("Coup de pied enflammer : frame 6 dégâts + stun premier hit")
        end, FrameToMs(FRAME_6_DAMAGE))

        ----------------------------------------------------
        -- FRAME 17 : 10 dégâts + stun seulement si la cible n'a pas encore été touchée
        ----------------------------------------------------
        Timer.SetTimeout(function()
            local liveChar = GetValidChar(caster)
            if not liveChar then return end

            DoFrontDamage(
                liveChar,
                KICK_DAMAGE,
                KICK_DISTANCE,
                KICK_RADIUS,
                170,
                "frame 17",
                function(entity)
                    StunOnFirstDamage(entity)
                end
            )

            Console.Log("Coup de pied enflammer : frame 17 dégâts")
        end, FrameToMs(FRAME_17_DAMAGE))

        ----------------------------------------------------
        -- FRAME 30 : P_Spell_03_Converted + 30 dégâts + stun si premier hit
        ----------------------------------------------------
        Timer.SetTimeout(function()
            local liveChar = GetValidChar(caster)
            if not liveChar then return end

            SpawnFireKickParticle(
                liveChar,
                touchedByFire,
                function(entity)
                    StunOnFirstDamage(entity)
                end
            )

            Console.Log("Coup de pied enflammer : frame 30 P_Spell_03_Converted")
        end, FrameToMs(FRAME_FIRE_FX))

        ----------------------------------------------------
        -- FRAME 38 : camera shake + propulsion seulement
        ----------------------------------------------------
        Timer.SetTimeout(function()
            local liveChar = GetValidChar(caster)
            if not liveChar then return end

            KnockbackFireTargets(liveChar, touchedByFire)

            if Events and Events.CallRemote and caster then
                Events.CallRemote("CoupPiedEnflammerCameraShake", caster, 5.5, 420, 12)
            end

            Console.Log("Coup de pied enflammer : frame 38 camera shake + propulsion")
        end, FrameToMs(FRAME_SHAKE))
    end,
})

------------------------------------------------------------
-- SPELL : TORNADE DE FEU
-- Frame 30 : la particule tornade apparaît
-- Frame 42 : le joueur disparaît, prend le contrôle de la tornade
-- Pendant la transformation :
-- déplacement rapide + dégâts autour + son + caméra éloignée + tremblement continu
------------------------------------------------------------

------------------------------------------------------------
-- ÉTAT PARTAGÉ
------------------------------------------------------------
TORNADE_FEU_CAMERA_REGISTERED = TORNADE_FEU_CAMERA_REGISTERED or false
TORNADE_FEU_CAMERA_STATE = TORNADE_FEU_CAMERA_STATE or {
    active = false,
    interval = nil,
    baseRot = nil,
    startTime = nil
}

------------------------------------------------------------
-- ASSETS
------------------------------------------------------------
local TORNADO_ANIM  = "dragon-lee-animset::AM_tornade"
local TORNADO_FX    = "stylized-tornado::NS_StylizedTornado_Orange_v06"
local TORNADO_SOUND = "animtest::tornadefeu"

------------------------------------------------------------
-- RÉGLAGES
------------------------------------------------------------
local FPS = 30

-- La tornade apparaît à la frame 30
local TORNADO_PRESPAWN_FRAME = 30

-- Le joueur disparaît et prend le contrôle à la frame 42
local TORNADO_CONTROL_FRAME = 42

-- Durée de transformation après la frame 42
local TORNADO_DURATION_MS = 5700

-- Dégâts autour de la tornade
local TORNADO_DAMAGE = 10
local TORNADO_RADIUS = 330
local TORNADO_DAMAGE_INTERVAL_MS = 650

-- Position de la tornade par rapport au joueur
local TORNADO_HEIGHT_OFFSET = 15

-- Caméra pendant la transformation
local CAMERA_DISTANCE = 2300
local CAMERA_HEIGHT   = 900
local CAMERA_FOV      = 115

-- Tremblement pendant toute la transformation
local TORNADO_SHAKE_INTENSITY = 0.7
local TORNADO_SHAKE_INTERVAL_MS = 10

-- Déplacement rapide pendant la tornade
local TORNADO_FAST_MOVE_SPEED = 30000
local TORNADO_FAST_MOVE_INTERVAL_MS = 50

-- Son de transformation
local TORNADO_SOUND_VOLUME = 2.0
local TORNADO_SOUND_PITCH  = 1.0

-- 50 mètres = environ 5000 unités Unreal / nanos world
local TORNADO_SOUND_RADIUS = 5000
local TORNADO_SOUND_INNER_RADIUS = 250

------------------------------------------------------------
-- UTILS
------------------------------------------------------------
local function FrameToMs(frame)
    return math.floor((frame / FPS) * 1000)
end

local function NormalizeVector(v)
    if not v then return Vector(1, 0, 0) end

    local len = math.sqrt((v.X * v.X) + (v.Y * v.Y) + (v.Z * v.Z))
    if len <= 0.0001 then
        return Vector(1, 0, 0)
    end

    return Vector(v.X / len, v.Y / len, v.Z / len)
end

local function SafeDestroy(entity)
    if not entity then return end

    pcall(function()
        entity:Destroy()
    end)
end

local function ClearIntervalSafe(interval)
    if not interval then return end

    pcall(function()
        Timer.ClearInterval(interval)
    end)
end

local function SafeGetLocation(entity)
    local loc = nil

    pcall(function()
        loc = entity:GetLocation()
    end)

    return loc
end

local function SafeGetRotation(entity)
    local rot = nil

    pcall(function()
        rot = entity:GetRotation()
    end)

    if not rot then
        rot = Rotator(0, 0, 0)
    end

    return rot
end

local function SafeSetLocation(entity, loc)
    if not entity or not loc then return end

    pcall(function()
        entity:SetLocation(loc)
    end)
end

local function SafeSetRotation(entity, rot)
    if not entity or not rot then return end

    pcall(function()
        entity:SetRotation(rot)
    end)
end

local function SafeApplyDamage(entity, damage)
    if not entity then return end

    local ok, err = pcall(function()
        entity:ApplyDamage(damage)
    end)

    if not ok then
        Console.Log("Tornade de feu : erreur ApplyDamage : " .. tostring(err))
    end
end

local function SetCharacterVisible(char, visible)
    if not char then return end

    local okVisibility = pcall(function()
        char:SetVisibility(visible)
    end)

    if not okVisibility then
        pcall(function()
            char:SetHidden(not visible)
        end)
    end
end

------------------------------------------------------------
-- SON DE TRANSFORMATION TORNADE
------------------------------------------------------------
local function PlayTornadoTransformSound(char)
    if not char then return end

    local loc = SafeGetLocation(char)
    if not loc then return end

    if not Sound then
        Console.Log("Tornade de feu : Sound global introuvable")
        return
    end

    local soundType = nil
    if SoundType and SoundType.SFX then
        soundType = SoundType.SFX
    end

    local tornadoSound = nil

    local okSound, errSound = pcall(function()
        tornadoSound = Sound(
            loc + Vector(0, 0, 120),
            TORNADO_SOUND,
            false,
            true,
            soundType,
            TORNADO_SOUND_VOLUME,
            TORNADO_SOUND_PITCH,
            TORNADO_SOUND_INNER_RADIUS,
            TORNADO_SOUND_RADIUS
        )
    end)

    if not okSound or not tornadoSound then
        Console.Log("Tornade de feu : erreur son tornadefeu : " .. tostring(errSound))
        return
    end

    Timer.SetTimeout(function()
        SafeDestroy(tornadoSound)
        tornadoSound = nil
    end, 6000)

    Console.Log("Tornade de feu : son tornadefeu joué dans une zone de 50 mètres")
end

------------------------------------------------------------
-- DÉPLACEMENT RAPIDE PENDANT LA TORNADE
------------------------------------------------------------
local function StartTornadoFastMovement(caster, char)
    if not char then return nil end

    local moveInterval = nil

    moveInterval = Timer.SetInterval(function()
        if not char then return end

        local controlRot = nil
        local currentVel = nil

        -- Rotation de contrôle du character
        pcall(function()
            controlRot = char:GetControlRotation()
        end)

        -- Fallback sur le player caster
        if not controlRot and caster then
            pcall(function()
                controlRot = caster:GetControlRotation()
            end)
        end

        -- Fallback sur la rotation du character
        if not controlRot then
            pcall(function()
                controlRot = char:GetRotation()
            end)
        end

        if not controlRot then return end

        pcall(function()
            currentVel = char:GetVelocity()
        end)

        if not currentVel then
            currentVel = Vector(0, 0, 0)
        end

        local forward = NormalizeVector(controlRot:GetForwardVector())

        -- On bloque le Z pour éviter que le joueur monte ou descende trop
        forward = NormalizeVector(Vector(forward.X, forward.Y, 0))

        local newVelocity = Vector(
            forward.X * TORNADO_FAST_MOVE_SPEED,
            forward.Y * TORNADO_FAST_MOVE_SPEED,
            currentVel.Z
        )

        pcall(function()
            char:SetVelocity(newVelocity)
        end)

        pcall(function()
            char:SetForce(Vector(
                forward.X * TORNADO_FAST_MOVE_SPEED,
                forward.Y * TORNADO_FAST_MOVE_SPEED,
                0
            ))
        end)
    end, TORNADO_FAST_MOVE_INTERVAL_MS)

    return moveInterval
end

local function StopTornadoFastMovement(char, moveInterval)
    if moveInterval then
        pcall(function()
            Timer.ClearInterval(moveInterval)
        end)
    end

    if char then
        pcall(function()
            char:SetForce(Vector(0, 0, 0))
        end)

        pcall(function()
            char:SetVelocity(Vector(0, 0, 0))
        end)
    end
end

------------------------------------------------------------
-- CAMERA CLIENT : ÉLOIGNÉE + HAUTE + TREMBLEMENT CONTINU
------------------------------------------------------------
local function StartTornadoCamera()
    if not Client or not Client.GetLocalPlayer then return end

    local localPlayer = nil

    pcall(function()
        localPlayer = Client.GetLocalPlayer()
    end)

    if not localPlayer then return end

    TORNADE_FEU_CAMERA_STATE.active = true
    TORNADE_FEU_CAMERA_STATE.startTime = os.clock()

    pcall(function()
        TORNADE_FEU_CAMERA_STATE.baseRot = localPlayer:GetCameraRotation()
    end)

    pcall(function()
        localPlayer:SetCameraDistance(CAMERA_DISTANCE)
    end)

    pcall(function()
        localPlayer:SetCameraArmLength(CAMERA_DISTANCE)
    end)

    pcall(function()
        localPlayer:SetCameraFOV(CAMERA_FOV)
    end)

    pcall(function()
        localPlayer:SetCameraOffset(Vector(0, 0, CAMERA_HEIGHT))
    end)

    pcall(function()
        localPlayer:SetCameraBoomOffset(Vector(0, 0, CAMERA_HEIGHT))
    end)

    if TORNADE_FEU_CAMERA_STATE.interval then
        ClearIntervalSafe(TORNADE_FEU_CAMERA_STATE.interval)
        TORNADE_FEU_CAMERA_STATE.interval = nil
    end

    TORNADE_FEU_CAMERA_STATE.interval = Timer.SetInterval(function()
        if not TORNADE_FEU_CAMERA_STATE.active then return end

        -- Certains gamemodes reset la caméra, donc on force les valeurs en boucle
        pcall(function()
            localPlayer:SetCameraDistance(CAMERA_DISTANCE)
        end)

        pcall(function()
            localPlayer:SetCameraArmLength(CAMERA_DISTANCE)
        end)

        pcall(function()
            localPlayer:SetCameraFOV(CAMERA_FOV)
        end)

        pcall(function()
            localPlayer:SetCameraOffset(Vector(0, 0, CAMERA_HEIGHT))
        end)

        pcall(function()
            localPlayer:SetCameraBoomOffset(Vector(0, 0, CAMERA_HEIGHT))
        end)

        ----------------------------------------------------
        -- TREMBLEMENT CONTINU
        ----------------------------------------------------
        local elapsed = 0

        if TORNADE_FEU_CAMERA_STATE.startTime then
            elapsed = os.clock() - TORNADE_FEU_CAMERA_STATE.startTime
        end

        local shakePower = TORNADO_SHAKE_INTENSITY

        -- Tremblement plus fort au début de la transformation
        if elapsed < 0.8 then
            shakePower = TORNADO_SHAKE_INTENSITY * 2.0
        end

        local pitchShake = ((math.random() * 2.0) - 1.0) * shakePower
        local yawShake   = ((math.random() * 2.0) - 1.0) * shakePower
        local rollShake  = ((math.random() * 2.0) - 1.0) * shakePower * 0.45

        local rot = nil

        pcall(function()
            rot = localPlayer:GetCameraRotation()
        end)

        if rot then
            pcall(function()
                localPlayer:SetCameraRotation(Rotator(
                    -22 + pitchShake,
                    rot.Yaw + yawShake,
                    rot.Roll + rollShake
                ))
            end)
        end
    end, TORNADO_SHAKE_INTERVAL_MS)
end

local function StopTornadoCamera()
    if not Client or not Client.GetLocalPlayer then return end

    local localPlayer = nil

    pcall(function()
        localPlayer = Client.GetLocalPlayer()
    end)

    if not localPlayer then return end

    TORNADE_FEU_CAMERA_STATE.active = false
    TORNADE_FEU_CAMERA_STATE.startTime = nil

    if TORNADE_FEU_CAMERA_STATE.interval then
        ClearIntervalSafe(TORNADE_FEU_CAMERA_STATE.interval)
        TORNADE_FEU_CAMERA_STATE.interval = nil
    end

    pcall(function()
        localPlayer:SetCameraDistance(450)
    end)

    pcall(function()
        localPlayer:SetCameraArmLength(450)
    end)

    pcall(function()
        localPlayer:SetCameraFOV(90)
    end)

    pcall(function()
        localPlayer:SetCameraOffset(Vector(0, 0, 0))
    end)

    pcall(function()
        localPlayer:SetCameraBoomOffset(Vector(0, 0, 0))
    end)

    if TORNADE_FEU_CAMERA_STATE.baseRot then
        pcall(function()
            localPlayer:SetCameraRotation(TORNADE_FEU_CAMERA_STATE.baseRot)
        end)
    end

    TORNADE_FEU_CAMERA_STATE.baseRot = nil
end

if not TORNADE_FEU_CAMERA_REGISTERED and Events and Events.SubscribeRemote then
    TORNADE_FEU_CAMERA_REGISTERED = true

    Events.SubscribeRemote("TornadeFeuCamera", function(enabled)
        if enabled then
            StartTornadoCamera()
        else
            StopTornadoCamera()
        end
    end)
end

------------------------------------------------------------
-- FRAME 30 : SPAWN DE LA TORNADE AVANT TRANSFORMATION
------------------------------------------------------------
local function SpawnPreTornadoFX(char)
    if not char then return nil end

    local loc = SafeGetLocation(char)
    local rot = SafeGetRotation(char)

    if not loc then return nil end

    local tornadoFX = nil

    local okFX, errFX = pcall(function()
        tornadoFX = Particle(
            loc + Vector(0, 0, TORNADO_HEIGHT_OFFSET),
            rot,
            TORNADO_FX,
            false,
            true
        )
    end)

    if not okFX or not tornadoFX then
        Console.Log("Tornade de feu : erreur spawn frame 30 : " .. tostring(errFX))
        return nil
    end

    pcall(function()
        tornadoFX:SetScale(Vector(1.4, 1.4, 1.4))
    end)

    local tracker = {
        fx = tornadoFX,
        followInterval = nil
    }

    -- La tornade suit déjà le joueur entre la frame 30 et la frame 42
    tracker.followInterval = Timer.SetInterval(function()
        if not tracker.fx then return end

        local liveLoc = SafeGetLocation(char)
        local liveRot = SafeGetRotation(char)

        if not liveLoc then return end

        SafeSetLocation(tracker.fx, liveLoc + Vector(0, 0, TORNADO_HEIGHT_OFFSET))
        SafeSetRotation(tracker.fx, liveRot)
    end, 15)

    Console.Log("Tornade de feu : particule apparue à la frame 30")

    return tracker
end

------------------------------------------------------------
-- FRAME 42 : TRANSFORMATION + CONTRÔLE + DÉGÂTS + SON
------------------------------------------------------------
local function ActivateTornadoControl(sp, caster, char, tornadoTracker)
    if not caster or not char then return end

    local startLoc = SafeGetLocation(char)

    if not startLoc then return end

    --------------------------------------------------------
    -- Si la particule n'a pas spawn à la frame 30, fallback ici
    --------------------------------------------------------
    if not tornadoTracker or not tornadoTracker.fx then
        tornadoTracker = SpawnPreTornadoFX(char)
    end

    if not tornadoTracker or not tornadoTracker.fx then
        Console.Log("Tornade de feu : impossible d'activer la transformation, FX absent")
        return
    end

    --------------------------------------------------------
    -- Cache le joueur à la frame 42
    --------------------------------------------------------
    SetCharacterVisible(char, false)

    --------------------------------------------------------
    -- Son de transformation entendu dans une zone de 50 mètres
    --------------------------------------------------------
    PlayTornadoTransformSound(char)

    --------------------------------------------------------
    -- Déplacement rapide pendant la transformation
    --------------------------------------------------------
    local tornadoMoveInterval = StartTornadoFastMovement(caster, char)

    --------------------------------------------------------
    -- Éloigne, monte et fait trembler la caméra du joueur transformé
    --------------------------------------------------------
    pcall(function()
        if Events and Events.CallRemote and caster then
            Events.CallRemote("TornadeFeuCamera", caster, true)
        end
    end)

    --------------------------------------------------------
    -- Hitbox de dégâts autour de la tornade
    --------------------------------------------------------
    local tornadoTrigger = nil

    local okTrigger, errTrigger = pcall(function()
        tornadoTrigger = Trigger(
            startLoc + Vector(0, 0, 90),
            Rotator(0, 0, 0),
            TORNADO_RADIUS,
            TriggerType.Sphere,
            true,
            Color.RED,
            { "Character", "CharacterSimple" }
        )
    end)

    if not okTrigger or not tornadoTrigger then
        Console.Log("Tornade de feu : erreur trigger : " .. tostring(errTrigger))
    end

    local entitiesInside = {}

    if tornadoTrigger then
        tornadoTrigger:Subscribe("BeginOverlap", function(_, entity)
            if not entity then return end
            if entity == char then return end

            entitiesInside[entity] = true
        end)

        tornadoTrigger:Subscribe("EndOverlap", function(_, entity)
            if not entity then return end

            entitiesInside[entity] = nil
        end)
    end

    --------------------------------------------------------
    -- À partir de la frame 42, la tornade suit le joueur
    -- et la hitbox suit aussi
    --------------------------------------------------------
    if tornadoTracker.followInterval then
        ClearIntervalSafe(tornadoTracker.followInterval)
        tornadoTracker.followInterval = nil
    end

    tornadoTracker.followInterval = Timer.SetInterval(function()
        local liveLoc = SafeGetLocation(char)
        local liveRot = SafeGetRotation(char)

        if not liveLoc then return end

        local tornadoLoc = liveLoc + Vector(0, 0, TORNADO_HEIGHT_OFFSET)
        local triggerLoc = liveLoc + Vector(0, 0, 90)

        SafeSetLocation(tornadoTracker.fx, tornadoLoc)
        SafeSetRotation(tornadoTracker.fx, liveRot)

        if tornadoTrigger then
            SafeSetLocation(tornadoTrigger, triggerLoc)
        end
    end, 15)

    --------------------------------------------------------
    -- Dégâts en boucle aux joueurs / CharacterSimple proches
    --------------------------------------------------------
    local damageInterval = nil

    damageInterval = Timer.SetInterval(function()
        for entity, _ in pairs(entitiesInside) do
            if entity and entity ~= char then
                SafeApplyDamage(entity, sp.damage or TORNADO_DAMAGE)

                Console.Log(
                    "Tornade de feu : " ..
                    tostring(sp.damage or TORNADO_DAMAGE) ..
                    " dégâts appliqués"
                )
            end
        end
    end, TORNADO_DAMAGE_INTERVAL_MS)

    --------------------------------------------------------
    -- Fin de transformation
    --------------------------------------------------------
    Timer.SetTimeout(function()
        if tornadoTracker then
            ClearIntervalSafe(tornadoTracker.followInterval)
            tornadoTracker.followInterval = nil

            SafeDestroy(tornadoTracker.fx)
            tornadoTracker.fx = nil
        end

        ClearIntervalSafe(damageInterval)
        damageInterval = nil

        entitiesInside = {}

        SafeDestroy(tornadoTrigger)
        tornadoTrigger = nil

        StopTornadoFastMovement(char, tornadoMoveInterval)
        tornadoMoveInterval = nil

        SetCharacterVisible(char, true)

        pcall(function()
            if Events and Events.CallRemote and caster then
                Events.CallRemote("TornadeFeuCamera", caster, false)
            end
        end)

        Console.Log("Tornade de feu : transformation terminée")
    end, TORNADO_DURATION_MS)
end

------------------------------------------------------------
-- REGISTER SPELL
------------------------------------------------------------
SpellRegistry.Register({
    id       = "tornade_feu",
    name     = "Tornade de feu",
    desc     = "Le joueur invoque une tornade de feu puis se transforme dedans en se déplaçant rapidement.",
    clan     = "feu",
    category = "Hériditaire",
    type     = "attack",

    damage = TORNADO_DAMAGE,

    cost     = 35,
    cooldown = 7,
    rang     = "A",
    range    = 350,
    iconUrl  = "https://i.pinimg.com/736x/dc/ad/e0/dcade022c361ec84172ecf88fbdde84e.jpg",

    Cast = function(sp, caster, data)
        local char = GetValidChar(caster)
        if not char then return end

        local tornadoTracker = nil

        ----------------------------------------------------
        -- Lance le montage AM_tornade
        ----------------------------------------------------
        local okAnim, errAnim = pcall(function()
            char:PlayAnimation(TORNADO_ANIM)
        end)

        if not okAnim then
            Console.Log("Tornade de feu : erreur PlayAnimation AM_tornade : " .. tostring(errAnim))
            return
        end

        Console.Log("Tornade de feu : AM_tornade lancé")

        ----------------------------------------------------
        -- Frame 30 : apparition de la tornade
        ----------------------------------------------------
        Timer.SetTimeout(function()
            local liveChar = GetValidChar(caster)
            if not liveChar then return end

            tornadoTracker = SpawnPreTornadoFX(liveChar)
        end, FrameToMs(TORNADO_PRESPAWN_FRAME))

        ----------------------------------------------------
        -- Frame 42 : transformation / contrôle / dégâts / vitesse / son / tremblement
        ----------------------------------------------------
        Timer.SetTimeout(function()
            local liveChar = GetValidChar(caster)
            if not liveChar then return end

            Console.Log("Tornade de feu : contrôle pris à la frame 42")

            ActivateTornadoControl(sp, caster, liveChar, tornadoTracker)
        end, FrameToMs(TORNADO_CONTROL_FRAME))
    end,
})

------------------------------------------------------------
-- BOULE DE FEU — état partagé
------------------------------------------------------------
BOULE_FEU_AIM_STATE = BOULE_FEU_AIM_STATE or {}
BOULE_FEU_AIM_REMOTE_REGISTERED = BOULE_FEU_AIM_REMOTE_REGISTERED or false
BOULE_FEU_CAMERA_SHAKE_REGISTERED = BOULE_FEU_CAMERA_SHAKE_REGISTERED or false

local BouleFeuAimState = BOULE_FEU_AIM_STATE

------------------------------------------------------------
-- ASSETS
------------------------------------------------------------
local BOULE_FEU_ANIM = "magical-anim-set::AM_feud"

local FIREBALL_FX = "stylized-fx-2::P_Magic_Arrow_Projectile_1"
local HIT_FX      = "vefects::NS_Radial_Burst"

------------------------------------------------------------
-- RÉGLAGES
------------------------------------------------------------
local FPS = 30

local FIREBALL_FRAME = 17

local FIREBALL_DAMAGE = 30

-- C'EST ICI QUE TU MODIFIES LA VITESSE DE LA PARTICULE
-- Plus le nombre est haut, plus la boule de feu va vite.
local FIREBALL_SPEED = 5000

local FIREBALL_LIFETIME_MS = 2600

local FIREBALL_SPAWN_FORWARD = 135
local FIREBALL_SPAWN_HEIGHT  = 95

-- Si la boule passe à travers les ennemis, augmente ce rayon.
local FIREBALL_HIT_RADIUS = 140

-- Plus petit = hitbox plus précise.
-- Si le trigger rate encore les ennemis, mets 10.
local FIREBALL_UPDATE_MS = 15

-- Tremblement de caméra quand la boule apparaît
local FIREBALL_SHAKE_INTENSITY = 6.0
local FIREBALL_SHAKE_DURATION_MS = 360
local FIREBALL_SHAKE_INTERVAL_MS = 12

------------------------------------------------------------
-- UTILS
------------------------------------------------------------
local function FrameToMs(frame)
    return math.floor((frame / FPS) * 1000)
end

local function NormalizeVector(v)
    if not v then return Vector(1, 0, 0) end

    local len = math.sqrt((v.X * v.X) + (v.Y * v.Y) + (v.Z * v.Z))

    if len <= 0.0001 then
        return Vector(1, 0, 0)
    end

    return Vector(v.X / len, v.Y / len, v.Z / len)
end

local function SafeDestroy(entity)
    if not entity then return end

    pcall(function()
        entity:Destroy()
    end)
end

local function ClearIntervalSafe(interval)
    if not interval then return end

    pcall(function()
        Timer.ClearInterval(interval)
    end)
end

local function SafeGetLocation(entity)
    local loc = nil

    pcall(function()
        loc = entity:GetLocation()
    end)

    return loc
end

local function SafeGetRotation(entity)
    local rot = nil

    pcall(function()
        rot = entity:GetRotation()
    end)

    if not rot then
        rot = Rotator(0, 0, 0)
    end

    return rot
end

local function SafeSetLocation(entity, loc)
    if not entity or not loc then return end

    pcall(function()
        entity:SetLocation(loc)
    end)
end

local function SafeTranslateTo(entity, loc, time, exp)
    if not entity or not loc then return end

    pcall(function()
        entity:TranslateTo(loc, time, exp or 0)
    end)
end

local function SafeSetRotation(entity, rot)
    if not entity or not rot then return end

    pcall(function()
        entity:SetRotation(rot)
    end)
end

local function SafeApplyDamage(entity, amount)
    if not entity then return end

    local ok, err = pcall(function()
        entity:ApplyDamage(amount)
    end)

    if not ok then
        Console.Log("Boule de feu : erreur ApplyDamage : " .. tostring(err))
    end
end

local function RotationFromDirection(dir)
    dir = NormalizeVector(dir)

    local yaw = math.deg(math.atan(dir.Y, dir.X))
    local flatLen = math.sqrt((dir.X * dir.X) + (dir.Y * dir.Y))
    local pitch = math.deg(math.atan(dir.Z, flatLen))

    return Rotator(pitch, yaw, 0)
end

------------------------------------------------------------
-- CAMERA SHAKE CLIENT
------------------------------------------------------------
local function StartBouleFeuCameraShake(intensity, durationMs, intervalMs)
    intensity  = tonumber(intensity)  or FIREBALL_SHAKE_INTENSITY
    durationMs = tonumber(durationMs) or FIREBALL_SHAKE_DURATION_MS
    intervalMs = tonumber(intervalMs) or FIREBALL_SHAKE_INTERVAL_MS

    if not Client or not Client.GetLocalPlayer then return end
    if not Timer or not Timer.SetInterval then return end

    local localPlayer = nil

    pcall(function()
        localPlayer = Client.GetLocalPlayer()
    end)

    if not localPlayer then return end

    local baseRot = nil

    pcall(function()
        baseRot = localPlayer:GetCameraRotation()
    end)

    if not baseRot then return end

    local startTime = os.clock()
    local shakeInterval = nil

    shakeInterval = Timer.SetInterval(function()
        local elapsedMs = (os.clock() - startTime) * 1000

        if elapsedMs >= durationMs then
            if shakeInterval then
                ClearIntervalSafe(shakeInterval)
                shakeInterval = nil
            end

            pcall(function()
                localPlayer:SetCameraRotation(baseRot)
            end)

            return
        end

        local power = 1.0 - (elapsedMs / durationMs)

        local pitchOffset = ((math.random() * 2.0) - 1.0) * intensity * power
        local yawOffset   = ((math.random() * 2.0) - 1.0) * intensity * power
        local rollOffset  = ((math.random() * 2.0) - 1.0) * intensity * 0.35 * power

        pcall(function()
            localPlayer:SetCameraRotation(Rotator(
                baseRot.Pitch + pitchOffset,
                baseRot.Yaw   + yawOffset,
                baseRot.Roll  + rollOffset
            ))
        end)
    end, intervalMs)
end

if not BOULE_FEU_CAMERA_SHAKE_REGISTERED and Events and Events.SubscribeRemote then
    BOULE_FEU_CAMERA_SHAKE_REGISTERED = true

    Events.SubscribeRemote("BouleFeuCameraShake", function(intensity, durationMs, intervalMs)
        StartBouleFeuCameraShake(intensity, durationMs, intervalMs)
    end)
end

------------------------------------------------------------
-- REMOTE AIM CLIENT -> SERVER
------------------------------------------------------------
if not BOULE_FEU_AIM_REMOTE_REGISTERED and Events and Events.SubscribeRemote then
    BOULE_FEU_AIM_REMOTE_REGISTERED = true

    Events.SubscribeRemote("BouleFeuUpdateAim", function(player, x, y, z)
        if not player then return end
        if type(x) ~= "number" or type(y) ~= "number" or type(z) ~= "number" then return end

        BouleFeuAimState[player] = {
            dir = NormalizeVector(Vector(x, y, z)),
            time = os.clock()
        }
    end)
end

------------------------------------------------------------
-- FX IMPACT SUR LA CIBLE
------------------------------------------------------------
local function SpawnHitFX(victim)
    if not victim then return end

    local loc = SafeGetLocation(victim)
    local rot = SafeGetRotation(victim)

    if not loc then return end

    local fx = nil

    local okFX, errFX = pcall(function()
        fx = Particle(
            loc + Vector(0, 0, 90),
            rot,
            HIT_FX,
            false,
            true
        )
    end)

    if not okFX or not fx then
        Console.Log("Boule de feu : erreur NS_Radial_Burst : " .. tostring(errFX))
        return
    end

    pcall(function()
        fx:SetScale(Vector(1.2, 1.2, 1.2))
    end)

    Timer.SetTimeout(function()
        SafeDestroy(fx)
        fx = nil
    end, 900)
end

------------------------------------------------------------
-- PROJECTILE BOULE DE FEU
-- PARTICULE = TranslateTo
-- TRIGGER = SetLocation pour qu'il suive vraiment
------------------------------------------------------------
local function SpawnFireballProjectile(sp, caster, char, direction)
    if not char then return end

    local charLoc = SafeGetLocation(char)

    if not charLoc then return end

    direction = NormalizeVector(direction)

    local spawnLoc = charLoc
        + direction * FIREBALL_SPAWN_FORWARD
        + Vector(0, 0, FIREBALL_SPAWN_HEIGHT)

    local projectileRot = RotationFromDirection(direction)

    --------------------------------------------------------
    -- Spawn particule projectile
    --------------------------------------------------------
    local fireballFX = nil

    local okFX, errFX = pcall(function()
        fireballFX = Particle(
            spawnLoc,
            projectileRot,
            FIREBALL_FX,
            false,
            true
        )
    end)

    if not okFX or not fireballFX then
        Console.Log("Boule de feu : erreur P_Magic_Arrow_Projectile_1 : " .. tostring(errFX))
        return
    end

    pcall(function()
        fireballFX:SetScale(Vector(1.0, 1.0, 1.0))
    end)

    --------------------------------------------------------
    -- Tremblement caméra quand la boule apparaît
    --------------------------------------------------------
    pcall(function()
        if Events and Events.CallRemote and caster then
            Events.CallRemote(
                "BouleFeuCameraShake",
                caster,
                FIREBALL_SHAKE_INTENSITY,
                FIREBALL_SHAKE_DURATION_MS,
                FIREBALL_SHAKE_INTERVAL_MS
            )
        end
    end)

    --------------------------------------------------------
    -- Hitbox projectile
    --------------------------------------------------------
    local hitBox = nil

    local okTrigger, errTrigger = pcall(function()
        hitBox = Trigger(
            spawnLoc,
            projectileRot,
            FIREBALL_HIT_RADIUS,
            TriggerType.Sphere,
            true,
            Color.RED,
            { "Character", "CharacterSimple" }
        )
    end)

    if not okTrigger or not hitBox then
        Console.Log("Boule de feu : erreur hitbox projectile : " .. tostring(errTrigger))

        SafeDestroy(fireballFX)
        fireballFX = nil

        return
    end

    local projectileLoc = spawnLoc
    local alreadyHit = {}
    local projectileDestroyed = false
    local moveInterval = nil

    local function DestroyProjectile()
        if projectileDestroyed then return end

        projectileDestroyed = true

        ClearIntervalSafe(moveInterval)
        moveInterval = nil

        SafeDestroy(hitBox)
        hitBox = nil

        SafeDestroy(fireballFX)
        fireballFX = nil
    end

    --------------------------------------------------------
    -- Quand la boule touche un joueur / CharacterSimple
    --------------------------------------------------------
    hitBox:Subscribe("BeginOverlap", function(_, entity)
        if projectileDestroyed then return end
        if not entity then return end
        if entity == char then return end
        if alreadyHit[entity] then return end

        alreadyHit[entity] = true

        SafeApplyDamage(entity, sp.damage or FIREBALL_DAMAGE)
        SpawnHitFX(entity)

        Console.Log(
            "Boule de feu : cible touchée pour " ..
            tostring(sp.damage or FIREBALL_DAMAGE) ..
            " dégâts"
        )

        DestroyProjectile()
    end)

    --------------------------------------------------------
    -- Déplacement du projectile
    --------------------------------------------------------
    moveInterval = Timer.SetInterval(function()
        if projectileDestroyed then return end

        local segmentTimeSec = FIREBALL_UPDATE_MS / 1000
        local stepDistance = FIREBALL_SPEED * segmentTimeSec

        local nextLoc = projectileLoc + direction * stepDistance

        ----------------------------------------------------
        -- PARTICULE : TranslateTo
        ----------------------------------------------------
        SafeTranslateTo(fireballFX, nextLoc, segmentTimeSec, 0)
        SafeSetRotation(fireballFX, projectileRot)

        ----------------------------------------------------
        -- TRIGGER : SetLocation
        -- C'est ça qui corrige le problème du trigger immobile.
        ----------------------------------------------------
        if hitBox then
            SafeSetLocation(hitBox, nextLoc)
            SafeSetRotation(hitBox, projectileRot)
        end

        projectileLoc = nextLoc
    end, FIREBALL_UPDATE_MS)

    --------------------------------------------------------
    -- Despawn si ne touche rien
    --------------------------------------------------------
    Timer.SetTimeout(function()
        DestroyProjectile()
    end, FIREBALL_LIFETIME_MS)
end

------------------------------------------------------------
-- SPELL : BOULE DE FEU
------------------------------------------------------------
SpellRegistry.Register({
    id       = "boule_de_feu",
    name     = "Boule de feu",
    desc     = "Lance une boule de feu dans la dernière direction visée.",
    clan     = "feu",
    category = "Hériditaire",
    type     = "attack",

    damage = FIREBALL_DAMAGE,

    cost     = 25,
    cooldown = 4,
    rang     = "D",
    range    = 2500,
    iconUrl  = "https://i.pinimg.com/736x/8d/65/67/8d65675918e04430d605ea41e1d7441d.jpg",

    --------------------------------------------------------
    -- ClientCast : le joueur peut viser jusqu'à la frame 17
    --------------------------------------------------------
    ClientCast = function(self, char, player, data)
        if not char or not player then return nil end

        local defaultDir = Vector(1, 0, 0)

        local function SendCurrentAim()
            local camRot = nil

            pcall(function()
                camRot = player:GetCameraRotation()
            end)

            if not camRot then
                pcall(function()
                    camRot = char:GetRotation()
                end)
            end

            if not camRot then return end

            local dir = NormalizeVector(camRot:GetForwardVector())
            defaultDir = dir

            pcall(function()
                Events.CallRemote("BouleFeuUpdateAim", dir.X, dir.Y, dir.Z)
            end)
        end

        -- Envoie une première direction directement
        SendCurrentAim()

        -- Continue d'envoyer la direction jusqu'à la frame 17
        local aimInterval = nil

        aimInterval = Timer.SetInterval(function()
            SendCurrentAim()
        end, 25)

        Timer.SetTimeout(function()
            if aimInterval then
                ClearIntervalSafe(aimInterval)
                aimInterval = nil
            end
        end, FrameToMs(FIREBALL_FRAME) + 60)

        return {
            dirX = defaultDir.X,
            dirY = defaultDir.Y,
            dirZ = defaultDir.Z
        }
    end,

    --------------------------------------------------------
    -- Cast serveur
    --------------------------------------------------------
    Cast = function(sp, caster, data)
        local char = GetValidChar(caster)
        if not char then return end

        ----------------------------------------------------
        -- Lance le montage AM_feud
        ----------------------------------------------------
        local okAnim, errAnim = pcall(function()
            char:PlayAnimation(BOULE_FEU_ANIM)
        end)

        if not okAnim then
            Console.Log("Boule de feu : erreur PlayAnimation AM_feud : " .. tostring(errAnim))
            return
        end

        Console.Log("Boule de feu : AM_feud lancé")

        ----------------------------------------------------
        -- Frame 17 : spawn + propulsion de la boule de feu
        ----------------------------------------------------
        Timer.SetTimeout(function()
            local liveChar = GetValidChar(caster)
            if not liveChar then return end

            local direction = nil

            ------------------------------------------------
            -- Priorité : dernière direction envoyée par le client
            ------------------------------------------------
            local savedAim = BouleFeuAimState[caster]

            if savedAim and savedAim.dir and savedAim.time then
                if (os.clock() - savedAim.time) < 0.8 then
                    direction = savedAim.dir
                end
            end

            ------------------------------------------------
            -- Fallback : data envoyée par ClientCast
            ------------------------------------------------
            if not direction and data and data.dirX and data.dirY and data.dirZ then
                direction = NormalizeVector(Vector(data.dirX, data.dirY, data.dirZ))
            end

            ------------------------------------------------
            -- Fallback final : rotation du personnage
            ------------------------------------------------
            if not direction then
                local rot = SafeGetRotation(liveChar)
                direction = NormalizeVector(rot:GetForwardVector())
            end

            Console.Log("Boule de feu : projectile lancé à la frame 17 avec TranslateTo + trigger SetLocation")

            SpawnFireballProjectile(sp, caster, liveChar, direction)

            BouleFeuAimState[caster] = nil
        end, FrameToMs(FIREBALL_FRAME))
    end,
})

------------------------------------------------------------
-- DARK SLASH — état partagé
------------------------------------------------------------

------------------------------------------------------------
-- ASSETS
------------------------------------------------------------
local DARK_SLASH_ANIM = "nodachi::AM_dark"
local DARK_SLASH_FX   = "niagara-magical-slashes::NS_Slash_GuAtt_04"

------------------------------------------------------------
-- RÉGLAGES
------------------------------------------------------------
local FPS = 30

local DARK_SLASH_FRAME = 15

local DARK_SLASH_DAMAGE = 40

-- Durée pendant laquelle le slash suit le joueur
local DARK_SLASH_DURATION_MS = 900

-- Position du slash devant le joueur
local DARK_SLASH_FORWARD_OFFSET = 180
local DARK_SLASH_HEIGHT_OFFSET  = 90

-- Hitbox du slash
local DARK_SLASH_RADIUS = 180

-- Plus petit = le slash suit plus précisément le joueur
local DARK_SLASH_FOLLOW_INTERVAL_MS = 15

------------------------------------------------------------
-- UTILS
------------------------------------------------------------
local function FrameToMs(frame)
    return math.floor((frame / FPS) * 1000)
end

local function NormalizeVector(v)
    if not v then return Vector(1, 0, 0) end

    local len = math.sqrt((v.X * v.X) + (v.Y * v.Y) + (v.Z * v.Z))

    if len <= 0.0001 then
        return Vector(1, 0, 0)
    end

    return Vector(v.X / len, v.Y / len, v.Z / len)
end

local function SafeDestroy(entity)
    if not entity then return end

    pcall(function()
        entity:Destroy()
    end)
end

local function ClearIntervalSafe(interval)
    if not interval then return end

    pcall(function()
        Timer.ClearInterval(interval)
    end)
end

local function SafeGetLocation(entity)
    local loc = nil

    pcall(function()
        loc = entity:GetLocation()
    end)

    return loc
end

local function SafeGetRotation(entity)
    local rot = nil

    pcall(function()
        rot = entity:GetRotation()
    end)

    if not rot then
        rot = Rotator(0, 0, 0)
    end

    return rot
end

local function SafeSetLocation(entity, loc)
    if not entity or not loc then return end

    pcall(function()
        entity:SetLocation(loc)
    end)
end

local function SafeSetRotation(entity, rot)
    if not entity or not rot then return end

    pcall(function()
        entity:SetRotation(rot)
    end)
end

local function SafeApplyDamage(entity, amount)
    if not entity then return end

    local ok, err = pcall(function()
        entity:ApplyDamage(amount)
    end)

    if not ok then
        Console.Log("Dark Slash : erreur ApplyDamage : " .. tostring(err))
    end
end

local function GetSlashLocRot(char)
    if not char then return nil, nil end

    local loc = SafeGetLocation(char)
    local rot = SafeGetRotation(char)

    if not loc or not rot then return nil, nil end

    local forward = NormalizeVector(rot:GetForwardVector())

    local slashLoc = loc
        + forward * DARK_SLASH_FORWARD_OFFSET
        + Vector(0, 0, DARK_SLASH_HEIGHT_OFFSET)

    return slashLoc, rot
end

------------------------------------------------------------
-- SPAWN DU SLASH QUI SUIT LE JOUEUR
------------------------------------------------------------
local function SpawnDarkSlash(sp, caster, char)
    if not char then return end

    local slashLoc, slashRot = GetSlashLocRot(char)
    if not slashLoc or not slashRot then return end

    --------------------------------------------------------
    -- Particule slash
    --------------------------------------------------------
    local slashFX = nil

    local okFX, errFX = pcall(function()
        slashFX = Particle(
            slashLoc,
            slashRot,
            DARK_SLASH_FX,
            false,
            true
        )
    end)

    if not okFX or not slashFX then
        Console.Log("Dark Slash : erreur NS_Slash_GuAtt_04 : " .. tostring(errFX))
        return
    end

    pcall(function()
        slashFX:SetScale(Vector(1.0, 1.0, 1.0))
    end)

    --------------------------------------------------------
    -- Hitbox du slash
    --------------------------------------------------------
    local hitBox = nil

    local okTrigger, errTrigger = pcall(function()
        hitBox = Trigger(
            slashLoc,
            slashRot,
            DARK_SLASH_RADIUS,
            TriggerType.Sphere,
            true,
            Color.RED,
            { "Character", "CharacterSimple" }
        )
    end)

    if not okTrigger or not hitBox then
        Console.Log("Dark Slash : erreur hitbox : " .. tostring(errTrigger))

        SafeDestroy(slashFX)
        slashFX = nil

        return
    end

    local alreadyHit = {}

    --------------------------------------------------------
    -- Dégâts
    --------------------------------------------------------
    hitBox:Subscribe("BeginOverlap", function(_, entity)
        if not entity then return end
        if entity == char then return end
        if alreadyHit[entity] then return end

        alreadyHit[entity] = true

        SafeApplyDamage(entity, sp.damage or DARK_SLASH_DAMAGE)

        Console.Log(
            "Dark Slash : cible touchée pour " ..
            tostring(sp.damage or DARK_SLASH_DAMAGE) ..
            " dégâts"
        )
    end)

    --------------------------------------------------------
    -- Le slash suit le joueur
    --------------------------------------------------------
    local followInterval = nil

    followInterval = Timer.SetInterval(function()
        local liveChar = GetValidChar(caster)
        if not liveChar then return end

        local newLoc, newRot = GetSlashLocRot(liveChar)
        if not newLoc or not newRot then return end

        SafeSetLocation(slashFX, newLoc)
        SafeSetRotation(slashFX, newRot)

        if hitBox then
            SafeSetLocation(hitBox, newLoc)
            SafeSetRotation(hitBox, newRot)
        end
    end, DARK_SLASH_FOLLOW_INTERVAL_MS)

    --------------------------------------------------------
    -- Fin du slash
    --------------------------------------------------------
    Timer.SetTimeout(function()
        ClearIntervalSafe(followInterval)
        followInterval = nil

        SafeDestroy(hitBox)
        hitBox = nil

        SafeDestroy(slashFX)
        slashFX = nil

        Console.Log("Dark Slash : slash terminé")
    end, DARK_SLASH_DURATION_MS)
end

------------------------------------------------------------
-- SPELL : DARK SLASH
------------------------------------------------------------
SpellRegistry.Register({
    id       = "dark_slash",
    name     = "Dark Slash",
    desc     = "Lance un slash sombre qui suit le joueur et blesse les ennemis proches.",
    clan     = "Ombre",
    category = "Hériditaire",
    type     = "attack",

    damage = DARK_SLASH_DAMAGE,

    cost     = 25,
    cooldown = 4,
    rang     = "B",
    range    = 600,
    iconUrl  = "https://i.pinimg.com/736x/8f/22/2f/8f222f36a548e961fa02c5df15ee0672.jpg",

    Cast = function(sp, caster, data)
        local char = GetValidChar(caster)
        if not char then return end

        ----------------------------------------------------
        -- Lance le montage AM_dark
        ----------------------------------------------------
        local okAnim, errAnim = pcall(function()
            char:PlayAnimation(DARK_SLASH_ANIM)
        end)

        if not okAnim then
            Console.Log("Dark Slash : erreur PlayAnimation AM_dark : " .. tostring(errAnim))
            return
        end

        Console.Log("Dark Slash : AM_dark lancé")

        ----------------------------------------------------
        -- Frame 26 : spawn du slash
        ----------------------------------------------------
        Timer.SetTimeout(function()
            local liveChar = GetValidChar(caster)
            if not liveChar then return end

            SpawnDarkSlash(sp, caster, liveChar)

            Console.Log("Dark Slash : NS_Slash_GuAtt_04 apparu à la frame 26")
        end, FrameToMs(DARK_SLASH_FRAME))
    end,
})



SpellRegistry.Register({
    id       = "gojo_blue",
    name     = "Blue",
    desc     = "Attire violemment les cibles vers un point.",
    clan     = "gojo",
    category = "Hériditaire",
    type     = "projectile",
    damage   = 40,
    cost     = 30,
    cooldown = 5,
    range    = 2000,
})

SpellRegistry.Register({
    id       = "gojo_red",
    name     = "Red",
    desc     = "Repousse les cibles avec une force explosive.",
    clan     = "gojo",
    category = "Hériditaire",
    type     = "projectile",
    damage   = 60,
    cost     = 40,
    cooldown = 7,
    range    = 2000,
    levels   = {
        [1] = { damage = 60,  cost = 40, cooldown = 7, range = 2000, radius = 300, knockback = 1400, up = 380 },
        [2] = { damage = 85,  cost = 45, cooldown = 6, range = 2200, radius = 340, knockback = 1700, up = 420 },
        [3] = { damage = 120, cost = 50, cooldown = 5, range = 2400, radius = 380, knockback = 2050, up = 460 },
    },
})

;------------------------------------------------------------
-- ASSAUT DES TÉNÈBRES — VISÉE PRÉCISE JUSQU'À 50 MÈTRES
------------------------------------------------------------
(function()
    --------------------------------------------------------
    -- ASSETS
    --------------------------------------------------------
    local DARKNESS_DASH_FX =
        "improve-fights-vfx::P_Darkness_Dash"

    local LIGHTNING_HIT_FX =
        "stylized-fx-2::P_Beam_Lightning_Hit"

    --------------------------------------------------------
    -- CONFIGURATION
    --------------------------------------------------------
    local DAMAGE = 50
    local MAX_RANGE = 5000

    -- Taille de la hitbox qui parcourt le viseur.
    -- Baisse à 90 pour rendre la visée plus difficile.
    local AIM_HITBOX_RADIUS = 120

    -- La hitbox avance de 100 unités toutes les 5 ms.
    local SCAN_STEP = 100
    local SCAN_INTERVAL_MS = 5

    local VANISH_DURATION_MS = 500
    local HIT_DURATION_MS = 900

    local AIR_HEIGHT = 900
    local CASTER_BACK_OFFSET = 70
    local CASTER_UP_OFFSET = 40

    --------------------------------------------------------
    -- OUTILS
    --------------------------------------------------------
    local function Normalize(v)
        if not v then
            return Vector(1, 0, 0)
        end

        local length = math.sqrt(
            v.X * v.X +
            v.Y * v.Y +
            v.Z * v.Z
        )

        if length <= 0.0001 then
            return Vector(1, 0, 0)
        end

        return Vector(
            v.X / length,
            v.Y / length,
            v.Z / length
        )
    end

    local function GetLocation(entity)
        if not entity then return nil end

        local location = nil

        pcall(function()
            location = entity:GetLocation()
        end)

        return location
    end

    local function GetRotation(entity)
        if not entity then
            return Rotator(0, 0, 0)
        end

        local rotation = nil

        pcall(function()
            rotation = entity:GetRotation()
        end)

        return rotation or Rotator(0, 0, 0)
    end

    local function SetLocation(entity, location)
        if not entity or not location then return end

        pcall(function()
            entity:SetLocation(location)
        end)
    end

    local function SetVelocity(entity, velocity)
        if not entity then return end

        pcall(function()
            entity:SetVelocity(
                velocity or Vector(0, 0, 0)
            )
        end)
    end

    local function SetGravity(entity, enabled)
        if not entity then return end

        pcall(function()
            entity:SetGravityEnabled(enabled)
        end)
    end

    local function SetVisible(entity, visible)
        if not entity then return end

        local success = pcall(function()
            entity:SetVisibility(visible)
        end)

        if not success then
            pcall(function()
                entity:SetHidden(not visible)
            end)
        end
    end

    local function ApplyDamage(entity, damage)
        if not entity then return end

        local success, err = pcall(function()
            entity:ApplyDamage(damage)
        end)

        if not success then
            Console.Log(
                "Assaut ténèbres erreur dégâts : " ..
                tostring(err)
            )
        end
    end

    local function Destroy(entity)
        if not entity then return end

        pcall(function()
            entity:Destroy()
        end)
    end

    local function ClearInterval(interval)
        if not interval then return end

        pcall(function()
            Timer.ClearInterval(interval)
        end)
    end

    --------------------------------------------------------
    -- MAINTIENT UNE ENTITÉ IMMOBILE
    --------------------------------------------------------
    local function HoldEntity(entity, location)
        if not entity or not location then
            return nil
        end

        return Timer.SetInterval(function()
            SetLocation(entity, location)
            SetVelocity(entity, Vector(0, 0, 0))
        end, 20)
    end

    --------------------------------------------------------
    -- PARTICULE QUI SUIT UNE ENTITÉ
    --------------------------------------------------------
    local function SpawnFollowingParticle(
        entity,
        particleAsset,
        heightOffset
    )
        local location = GetLocation(entity)

        if not location then
            return nil
        end

        local rotation = GetRotation(entity)
        local particle = nil

        local success, err = pcall(function()
            particle = Particle(
                location + Vector(
                    0,
                    0,
                    heightOffset or 90
                ),
                rotation,
                particleAsset,
                false,
                true
            )
        end)

        if not success or not particle then
            Console.Log(
                "Assaut ténèbres erreur particule " ..
                tostring(particleAsset) ..
                " : " ..
                tostring(err)
            )

            return nil
        end

        local followInterval = nil

        followInterval = Timer.SetInterval(function()
            if not particle then
                ClearInterval(followInterval)
                followInterval = nil
                return
            end

            local liveLocation = GetLocation(entity)

            if not liveLocation then return end

            local liveRotation = GetRotation(entity)

            pcall(function()
                particle:SetLocation(
                    liveLocation + Vector(
                        0,
                        0,
                        heightOffset or 90
                    )
                )

                particle:SetRotation(liveRotation)
            end)
        end, 20)

        return {
            particle = particle,
            interval = followInterval
        }
    end

    local function DestroyFollowingParticle(tracker)
        if not tracker then return end

        ClearInterval(tracker.interval)
        tracker.interval = nil

        Destroy(tracker.particle)
        tracker.particle = nil
    end

    --------------------------------------------------------
    -- PROTECTION CONTRE LES DÉGÂTS DE CHUTE
    --------------------------------------------------------
    local function ProtectFromFall(entity, durationMs)
        if not entity then return end

        AIR_COMBO_NO_FALL_DAMAGE =
            AIR_COMBO_NO_FALL_DAMAGE or {}

        AIR_COMBO_NO_FALL_DAMAGE[entity] = true

        Timer.SetTimeout(function()
            if AIR_COMBO_NO_FALL_DAMAGE then
                AIR_COMBO_NO_FALL_DAMAGE[entity] = nil
            end
        end, durationMs or 4000)
    end

    --------------------------------------------------------
    -- COMBO APRÈS AVOIR TROUVÉ UNE CIBLE
    --------------------------------------------------------
    local function StartDarknessCombo(
        spell,
        caster,
        casterCharacter,
        victim,
        aimForward
    )
        if not casterCharacter or not victim then
            return
        end

        local casterStartLocation =
            GetLocation(casterCharacter)

        local victimStartLocation =
            GetLocation(victim)

        if not casterStartLocation or
           not victimStartLocation
        then
            return
        end

        ----------------------------------------------------
        -- IMMOBILISATION AU SOL
        ----------------------------------------------------
        SetVelocity(
            casterCharacter,
            Vector(0, 0, 0)
        )

        SetVelocity(
            victim,
            Vector(0, 0, 0)
        )

        SetGravity(casterCharacter, false)
        SetGravity(victim, false)

        local casterGroundHold =
            HoldEntity(
                casterCharacter,
                casterStartLocation
            )

        local victimGroundHold =
            HoldEntity(
                victim,
                victimStartLocation
            )

        ----------------------------------------------------
        -- PARTICULE DE DISPARITION
        ----------------------------------------------------
        local darknessTracker =
            SpawnFollowingParticle(
                casterCharacter,
                DARKNESS_DASH_FX,
                90
            )

        SetVisible(casterCharacter, false)

        Console.Log(
            "Assaut des ténèbres : disparition"
        )

        ----------------------------------------------------
        -- APRÈS 0,5 SECONDE
        ----------------------------------------------------
        Timer.SetTimeout(function()
            ClearInterval(casterGroundHold)
            ClearInterval(victimGroundHold)

            casterGroundHold = nil
            victimGroundHold = nil

            DestroyFollowingParticle(
                darknessTracker
            )

            darknessTracker = nil

            local victimLiveLocation =
                GetLocation(victim)

            if not victimLiveLocation then
                SetVisible(casterCharacter, true)
                SetGravity(casterCharacter, true)
                SetGravity(victim, true)
                return
            end

            ------------------------------------------------
            -- POSITION DE LA CIBLE EN L'AIR
            ------------------------------------------------
            local victimAirLocation =
                victimLiveLocation +
                Vector(0, 0, AIR_HEIGHT)

            ------------------------------------------------
            -- POSITION DU JOUEUR SUR LA CIBLE
            ------------------------------------------------
            local casterAirLocation =
                Vector(
                    victimAirLocation.X -
                    aimForward.X *
                    CASTER_BACK_OFFSET,

                    victimAirLocation.Y -
                    aimForward.Y *
                    CASTER_BACK_OFFSET,

                    victimAirLocation.Z +
                    CASTER_UP_OFFSET
                )

            SetLocation(
                victim,
                victimAirLocation
            )

            SetLocation(
                casterCharacter,
                casterAirLocation
            )

            SetVelocity(
                victim,
                Vector(0, 0, 0)
            )

            SetVelocity(
                casterCharacter,
                Vector(0, 0, 0)
            )

            SetVisible(casterCharacter, true)

            ------------------------------------------------
            -- MAINTIEN EN L'AIR
            ------------------------------------------------
            local casterAirHold =
                HoldEntity(
                    casterCharacter,
                    casterAirLocation
                )

            local victimAirHold =
                HoldEntity(
                    victim,
                    victimAirLocation
                )

            ------------------------------------------------
            -- PARTICULE SUR LA CIBLE
            ------------------------------------------------
            local lightningTracker =
                SpawnFollowingParticle(
                    victim,
                    LIGHTNING_HIT_FX,
                    90
                )

            ------------------------------------------------
            -- DÉGÂTS
            ------------------------------------------------
            ApplyDamage(
                victim,
                spell.damage or DAMAGE
            )

            Console.Log(
                "Assaut des ténèbres : cible touchée pour " ..
                tostring(spell.damage or DAMAGE) ..
                " dégâts"
            )

            ------------------------------------------------
            -- FIN DU COMBO
            ------------------------------------------------
            Timer.SetTimeout(function()
                DestroyFollowingParticle(
                    lightningTracker
                )

                lightningTracker = nil

                ClearInterval(casterAirHold)
                ClearInterval(victimAirHold)

                casterAirHold = nil
                victimAirHold = nil

                SetVelocity(
                    casterCharacter,
                    Vector(0, 0, 0)
                )

                SetVelocity(
                    victim,
                    Vector(0, 0, 0)
                )

                ProtectFromFall(
                    casterCharacter,
                    4000
                )

                ProtectFromFall(
                    victim,
                    4000
                )

                SetGravity(
                    casterCharacter,
                    true
                )

                SetGravity(
                    victim,
                    true
                )

                Console.Log(
                    "Assaut des ténèbres terminé"
                )
            end, HIT_DURATION_MS)

        end, VANISH_DURATION_MS)
    end

    --------------------------------------------------------
    -- ENREGISTREMENT DU SORT
    --------------------------------------------------------
    SpellRegistry.Register({
        id       = "assaut_tenebres",
        name     = "Assaut des ténèbres",

        desc =
            "Disparaît et se téléporte sur l'ennemi directement visé.",

        clan     = "Ombre",
        category = "Hériditaire",
        type     = "attack",

        damage   = DAMAGE,
        cost     = 25,
        cooldown = 4,
        rang     = "B",
        range    = MAX_RANGE,
        iconUrl  = "https://i.pinimg.com/736x/28/35/43/283543dc3dd43287efca8fb5bbf62980.jpg",

        ----------------------------------------------------
        -- DIRECTION EXACTE DE LA CAMÉRA
        ----------------------------------------------------
        ClientCast = function(self, char, player, _)
            if not char or not player then
                return nil
            end

            local cameraRotation = nil

            pcall(function()
                cameraRotation =
                    player:GetCameraRotation()
            end)

            if not cameraRotation then
                pcall(function()
                    cameraRotation =
                        char:GetRotation()
                end)
            end

            if not cameraRotation then
                return nil
            end

            local forward =
                Normalize(
                    cameraRotation:GetForwardVector()
                )

            return {
                dirX = forward.X,
                dirY = forward.Y,
                dirZ = forward.Z
            }
        end,

        ----------------------------------------------------
        -- LANCEMENT
        ----------------------------------------------------
        Cast = function(spell, caster, data)
            local casterCharacter =
                GetValidChar(caster)

            if not casterCharacter then
                return
            end

            local casterLocation =
                GetLocation(casterCharacter)

            local casterRotation =
                GetRotation(casterCharacter)

            if not casterLocation then
                return
            end

            ------------------------------------------------
            -- DIRECTION DU VISEUR
            ------------------------------------------------
            local aimForward = nil

            if data and
               type(data.dirX) == "number" and
               type(data.dirY) == "number" and
               type(data.dirZ) == "number"
            then
                aimForward =
                    Normalize(
                        Vector(
                            data.dirX,
                            data.dirY,
                            data.dirZ
                        )
                    )
            else
                aimForward =
                    Normalize(
                        casterRotation:
                        GetForwardVector()
                    )
            end

            ------------------------------------------------
            -- DÉPART DE LA RECHERCHE
            ------------------------------------------------
            local aimOrigin =
                casterLocation +
                Vector(0, 0, 90)

            local scanTrigger = nil

            local triggerSuccess, triggerError =
                pcall(function()
                    scanTrigger = Trigger(
                        aimOrigin +
                        aimForward * 150,

                        casterRotation,

                        AIM_HITBOX_RADIUS,

                        TriggerType.Sphere,

                        true,

                        Color.RED,

                        {
                            "Character",
                            "CharacterSimple"
                        }
                    )
                end)

            if not triggerSuccess or
               not scanTrigger
            then
                Console.Log(
                    "Assaut ténèbres erreur hitbox : " ..
                    tostring(triggerError)
                )

                return
            end

            local targetFound = false
            local currentDistance = 150
            local scanInterval = nil

            ------------------------------------------------
            -- ARRÊTE ET DÉTRUIT LA RECHERCHE
            ------------------------------------------------
            local function StopScan()
                ClearInterval(scanInterval)
                scanInterval = nil

                Destroy(scanTrigger)
                scanTrigger = nil
            end

            ------------------------------------------------
            -- DÉTECTION D'UNE CIBLE
            ------------------------------------------------
            scanTrigger:Subscribe(
                "BeginOverlap",
                function(selfTrigger, entity)
                    if targetFound then return end
                    if not entity then return end
                    if entity == casterCharacter then return end

                    local entityLocation =
                        GetLocation(entity)

                    if not entityLocation then
                        return
                    end

                    targetFound = true

                    StopScan()

                    Console.Log(
                        "Assaut des ténèbres : cible détectée à " ..
                        tostring(
                            math.floor(
                                currentDistance / 100
                            )
                        ) ..
                        " mètres"
                    )

                    StartDarknessCombo(
                        spell,
                        caster,
                        casterCharacter,
                        entity,
                        aimForward
                    )
                end
            )

            ------------------------------------------------
            -- LA HITBOX AVANCE SUR LA LIGNE DU VISEUR
            ------------------------------------------------
            scanInterval =
                Timer.SetInterval(function()
                    if targetFound then
                        StopScan()
                        return
                    end

                    currentDistance =
                        currentDistance +
                        SCAN_STEP

                    if currentDistance >
                        MAX_RANGE
                    then
                        StopScan()

                        Console.Log(
                            "Assaut des ténèbres : aucune cible directement visée"
                        )

                        return
                    end

                    local scanLocation =
                        aimOrigin +
                        aimForward *
                        currentDistance

                    pcall(function()
                        scanTrigger:SetLocation(
                            scanLocation
                        )
                    end)
                end, SCAN_INTERVAL_MS)
        end
    })
end)()
------------------------------------------------------------
-- RAINBOW DRAGON — invocation d'un dragon montable
--
-- DÉROULÉ :
--  1. Le dragon (skeletal mesh "jjk::dragon") apparaît, statique.
--  2. Le joueur joue l'animation "jjk::monterdragon" et monte dessus.
--  3. Une fois assis (anim "jjk::assisdragon" en boucle), le joueur
--     appuie sur sa touche avancer.
--  4. Le dragon joue "jjk::flydragon_Anim", décolle puis monte en l'air.
--  5. En vol, le joueur contrôle la direction du dragon avec sa caméra.
--  6. Le dragon disparaît automatiquement au bout de 30 secondes.
------------------------------------------------------------

------------------------------------------------------------
-- ÉTAT PARTAGÉ
------------------------------------------------------------
RAINBOW_DRAGON_STATE = RAINBOW_DRAGON_STATE or {}
RAINBOW_DRAGON_AIM_STATE = RAINBOW_DRAGON_AIM_STATE or {}
RAINBOW_DRAGON_AIM_REMOTE_REGISTERED = RAINBOW_DRAGON_AIM_REMOTE_REGISTERED or false
RAINBOW_DRAGON_TAKEOFF_REMOTE_REGISTERED = RAINBOW_DRAGON_TAKEOFF_REMOTE_REGISTERED or false
RAINBOW_DRAGON_CLIENT_REGISTERED = RAINBOW_DRAGON_CLIENT_REGISTERED or false

(function()
    --------------------------------------------------------
    -- ASSETS (tous dans le pack "jjk")
    --------------------------------------------------------
    local DRAGON_MESH        = "jjk::dragon"
    local DRAGON_FLY_ANIM    = "jjk::flydragon_Anim"
    local PLAYER_MOUNT_ANIM  = "jjk::monterdragon"
    local PLAYER_SIT_ANIM    = "jjk::assisdragon"

    --------------------------------------------------------
    -- RÉGLAGES
    --------------------------------------------------------
    local FPS = 30

    -- Durée de l'animation "monterdragon" avant que le joueur soit assis.
    local MOUNT_FRAME = 40
    local MOUNT_TIME_MS = math.floor((MOUNT_FRAME / FPS) * 1000)

    -- Durée de vie totale du dragon une fois invoqué.
    local DRAGON_LIFETIME_MS = 30000

    -- Apparition du dragon : toujours juste À CÔTÉ du joueur et AU SOL,
    -- peu importe l'endroit où le sort est lancé.
    -- Distance latérale (sur le côté du joueur) en unités.
    local DRAGON_SPAWN_SIDE = 220

    -- Hauteur approximative entre le centre du joueur et ses pieds.
    -- Sert de repli si le trace de sol échoue.
    local CASTER_HALF_HEIGHT = 90

    -- Distance du trace vers le bas pour trouver le sol exact.
    local GROUND_TRACE_DOWN = 100000

    -- Placement du joueur sur le dos du dragon.
    -- Le joueur est attaché au BONE 139 du squelette du dragon.
    local DRAGON_SEAT_BONE = 139

    -- Offset relatif une fois attaché au bone (0 = collé pile sur le bone).
    local DRAGON_SEAT_OFFSET = Vector(0, 0, 0)

    -- Repli utilisé uniquement si l'attache au bone échoue.
    local DRAGON_SEAT_FALLBACK_OFFSET = Vector(0, 0, 160)

    -- Caméra : recul une fois le joueur monté sur le dragon.
    local MOUNTED_CAMERA_DISTANCE = 900
    -- Valeur remise à la fin du sort (3e personne par défaut).
    local DEFAULT_CAMERA_DISTANCE = 300

    -- Décollage : hauteur prise au moment du décollage.
    local TAKEOFF_RISE_HEIGHT = 700
    local TAKEOFF_RISE_TIME   = 1.6

    -- Vol libre.
    -- Plus le nombre est haut, plus le dragon va vite.
    local FLY_SPEED = 1700
    local FLY_UPDATE_MS = 15

    -- Limite la montée / descente verticale (0 = pas de vertical, 1 = libre).
    local FLY_VERTICAL_FACTOR = 0.85

    --------------------------------------------------------
    -- UTILS
    --------------------------------------------------------
    local function NormalizeVector(v)
        if not v then return Vector(1, 0, 0) end

        local len = math.sqrt((v.X * v.X) + (v.Y * v.Y) + (v.Z * v.Z))

        if len <= 0.0001 then
            return Vector(1, 0, 0)
        end

        return Vector(v.X / len, v.Y / len, v.Z / len)
    end

    local function RotationFromDirection(dir)
        dir = NormalizeVector(dir)

        local yaw = math.deg(math.atan(dir.Y, dir.X))
        local flatLen = math.sqrt((dir.X * dir.X) + (dir.Y * dir.Y))
        local pitch = math.deg(math.atan(dir.Z, flatLen))

        return Rotator(pitch, yaw, 0)
    end

    --------------------------------------------------------
    -- TROUVE LE SOL SOUS UN POINT
    -- Trace vers le bas pour poser le dragon au sol partout.
    -- Repli sur "pieds du joueur" si le trace échoue.
    --------------------------------------------------------
    local function GetGroundLocation(fromLoc, fallbackZ)
        if not fromLoc then return nil end

        local groundPt = nil

        pcall(function()
            if Trace and Trace.LineSingle then
                local collisionCh =
                    CollisionChannel.WorldStatic
                    | CollisionChannel.WorldDynamic
                    | CollisionChannel.PhysicsBody

                local traceMode = (TraceMode and TraceMode.TraceComplex) or 0

                local startPt = fromLoc + Vector(0, 0, 200)
                local endPt   = startPt + Vector(0, 0, -GROUND_TRACE_DOWN)

                local tr = Trace.LineSingle(startPt, endPt, collisionCh, traceMode, {})

                if tr and tr.Success then
                    groundPt = tr.Location or tr.ImpactPoint
                end
            end
        end)

        if groundPt then
            return Vector(fromLoc.X, fromLoc.Y, groundPt.Z)
        end

        -- Repli : niveau des pieds du joueur
        if fallbackZ then
            return Vector(fromLoc.X, fromLoc.Y, fallbackZ)
        end

        return fromLoc
    end

    local function SafeDestroy(entity)
        if not entity then return end

        pcall(function()
            entity:Destroy()
        end)
    end

    local function ClearIntervalSafe(interval)
        if not interval then return end

        pcall(function()
            Timer.ClearInterval(interval)
        end)
    end

    local function SafeGetLocation(entity)
        local loc = nil

        pcall(function()
            loc = entity:GetLocation()
        end)

        return loc
    end

    local function SafeGetRotation(entity)
        local rot = nil

        pcall(function()
            rot = entity:GetRotation()
        end)

        if not rot then
            rot = Rotator(0, 0, 0)
        end

        return rot
    end

    local function SafeSetLocation(entity, loc)
        if not entity or not loc then return end

        pcall(function()
            entity:SetLocation(loc)
        end)
    end

    local function SafeSetRotation(entity, rot)
        if not entity or not rot then return end

        pcall(function()
            entity:SetRotation(rot)
        end)
    end

    local function SafeSetVelocity(entity, velocity)
        if not entity then return end

        pcall(function()
            entity:SetVelocity(velocity or Vector(0, 0, 0))
        end)
    end

    local function SafeSetGravity(entity, enabled)
        if not entity then return end

        pcall(function()
            entity:SetGravityEnabled(enabled)
        end)
    end

    local function SafeTranslateTo(entity, loc, time, exp)
        if not entity or not loc then return end

        pcall(function()
            entity:TranslateTo(loc, time, exp or 0)
        end)
    end

    local function SafePlayAnimation(entity, animRef, logName)
        if not entity then return false end

        local ok, err = pcall(function()
            entity:PlayAnimation(animRef)
        end)

        if not ok then
            Console.Log("Rainbow Dragon : erreur PlayAnimation " .. tostring(logName) .. " : " .. tostring(err))
            return false
        end

        return true
    end

    --------------------------------------------------------
    -- NETTOYAGE COMPLET D'UNE INVOCATION
    --------------------------------------------------------
    local function CleanupDragon(caster)
        local state = RAINBOW_DRAGON_STATE[caster]
        if not state then return end

        -- Stoppe toutes les boucles
        ClearIntervalSafe(state.flyInterval)
        state.flyInterval = nil

        ClearIntervalSafe(state.lifetimeTimer)
        state.lifetimeTimer = nil

        -- Détache et rétablit le joueur
        if state.char then
            pcall(function()
                state.char:Detach()
            end)

            SafeSetGravity(state.char, true)
            SafeSetVelocity(state.char, Vector(0, 0, 0))

            pcall(function()
                state.char:StopAnimation()
            end)
        end

        -- Supprime le dragon
        SafeDestroy(state.dragon)
        state.dragon = nil

        RAINBOW_DRAGON_AIM_STATE[caster] = nil
        RAINBOW_DRAGON_STATE[caster] = nil

        -- Prévient le client d'arrêter l'écoute de la touche / de la visée
        pcall(function()
            if Events and Events.CallRemote and caster then
                Events.CallRemote("RainbowDragonStopControl", caster)
            end
        end)

        Console.Log("Rainbow Dragon : invocation terminée et nettoyée")
    end

    --------------------------------------------------------
    -- DERNIÈRE DIRECTION VISÉE PAR LE CLIENT
    --------------------------------------------------------
    local function GetLatestAim(caster, fallbackDir)
        local saved = RAINBOW_DRAGON_AIM_STATE[caster]

        if saved and saved.dir and saved.time then
            if (os.clock() - saved.time) < 0.6 then
                return NormalizeVector(saved.dir)
            end
        end

        return NormalizeVector(fallbackDir or Vector(1, 0, 0))
    end

    --------------------------------------------------------
    -- ASSOIT LE JOUEUR SUR LE DOS DU DRAGON
    --------------------------------------------------------
    local function SeatPlayerOnDragon(char, dragon)
        if not char or not dragon then return end

        local attached = false

        -- Attache le joueur au BONE 139 du squelette du dragon
        local okAttach, errAttach = pcall(function()
            attached = char:AttachTo(
                dragon,
                AttachmentRule.SnapToTarget,
                DRAGON_SEAT_BONE,
                -1,
                false
            )
        end)

        if not okAttach or not attached then
            -- Le bone est introuvable : on place le joueur manuellement au-dessus du dragon
            Console.Log("Rainbow Dragon : bone " .. tostring(DRAGON_SEAT_BONE) ..
                " introuvable, placement relatif : " .. tostring(errAttach))

            local dragonLoc = SafeGetLocation(dragon)
            local dragonRot = SafeGetRotation(dragon)

            if dragonLoc then
                SafeSetLocation(char, dragonLoc + DRAGON_SEAT_FALLBACK_OFFSET)
                SafeSetRotation(char, dragonRot)
            end
        else
            pcall(function()
                char:SetRelativeLocation(DRAGON_SEAT_OFFSET)
                char:SetRelativeRotation(Rotator(0, 0, 0))
            end)
        end

        -- Le joueur ne tombe plus tant qu'il est sur le dragon
        SafeSetVelocity(char, Vector(0, 0, 0))
        SafeSetGravity(char, false)

        -- Animation assise en boucle
        SafePlayAnimation(char, PLAYER_SIT_ANIM, "assisdragon")
    end

    --------------------------------------------------------
    -- DÉCOLLAGE + VOL CONTRÔLÉ
    --------------------------------------------------------
    local function StartDragonFlight(caster)
        local state = RAINBOW_DRAGON_STATE[caster]
        if not state or not state.dragon then return end
        if state.flying then return end

        state.flying = true

        local dragon = state.dragon

        -- Lance l'animation de vol du dragon
        SafePlayAnimation(dragon, DRAGON_FLY_ANIM, "flydragon_Anim")

        Console.Log("Rainbow Dragon : décollage")

        --------------------------------------------------------
        -- MONTÉE INITIALE
        --------------------------------------------------------
        local dragonLoc = SafeGetLocation(dragon)
        if not dragonLoc then return end

        local riseLoc = dragonLoc + Vector(0, 0, TAKEOFF_RISE_HEIGHT)
        SafeTranslateTo(dragon, riseLoc, TAKEOFF_RISE_TIME, 0)

        --------------------------------------------------------
        -- VOL LIBRE APRÈS LA MONTÉE
        --------------------------------------------------------
        Timer.SetTimeout(function()
            local liveState = RAINBOW_DRAGON_STATE[caster]
            if not liveState or not liveState.dragon then return end

            local flyDragon = liveState.dragon

            -- Direction de départ = orientation actuelle du dragon
            local startRot = SafeGetRotation(flyDragon)
            local fallbackDir = NormalizeVector(startRot:GetForwardVector())

            liveState.flyInterval = Timer.SetInterval(function()
                local s = RAINBOW_DRAGON_STATE[caster]
                if not s or not s.dragon then return end

                local currentLoc = SafeGetLocation(s.dragon)
                if not currentLoc then return end

                -- Direction visée par le joueur (caméra)
                local aimDir = GetLatestAim(caster, fallbackDir)

                -- On atténue la composante verticale pour un vol plus stable
                local moveDir = NormalizeVector(Vector(
                    aimDir.X,
                    aimDir.Y,
                    aimDir.Z * FLY_VERTICAL_FACTOR
                ))

                local stepDistance = FLY_SPEED * (FLY_UPDATE_MS / 1000)
                local nextLoc = currentLoc + moveDir * stepDistance
                local nextRot = RotationFromDirection(moveDir)

                SafeSetLocation(s.dragon, nextLoc)
                SafeSetRotation(s.dragon, nextRot)

                -- Si le joueur n'est pas réellement attaché, on le maintient assis
                if s.char and not s.attached then
                    SafeSetLocation(s.char, nextLoc + DRAGON_SEAT_FALLBACK_OFFSET)
                    SafeSetRotation(s.char, nextRot)
                    SafeSetVelocity(s.char, Vector(0, 0, 0))
                end
            end, FLY_UPDATE_MS)
        end, math.floor(TAKEOFF_RISE_TIME * 1000))
    end

    --------------------------------------------------------
    -- REMOTE : LE CLIENT ENVOIE SA DIRECTION DE CAMÉRA
    --------------------------------------------------------
    if not RAINBOW_DRAGON_AIM_REMOTE_REGISTERED and Events and Events.SubscribeRemote then
        RAINBOW_DRAGON_AIM_REMOTE_REGISTERED = true

        Events.SubscribeRemote("RainbowDragonUpdateAim", function(player, x, y, z)
            if not player then return end
            if type(x) ~= "number" or type(y) ~= "number" or type(z) ~= "number" then return end

            RAINBOW_DRAGON_AIM_STATE[player] = {
                dir = NormalizeVector(Vector(x, y, z)),
                time = os.clock()
            }
        end)
    end

    --------------------------------------------------------
    -- REMOTE : LE CLIENT A APPUYÉ SUR « AVANCER »
    --------------------------------------------------------
    if not RAINBOW_DRAGON_TAKEOFF_REMOTE_REGISTERED and Events and Events.SubscribeRemote then
        RAINBOW_DRAGON_TAKEOFF_REMOTE_REGISTERED = true

        Events.SubscribeRemote("RainbowDragonTakeOff", function(player)
            if not player then return end

            local state = RAINBOW_DRAGON_STATE[player]
            if not state then return end
            if not state.mounted then return end

            StartDragonFlight(player)
        end)
    end

    --------------------------------------------------------
    -- CÔTÉ CLIENT : ÉCOUTE DE LA TOUCHE AVANCER + ENVOI DE LA VISÉE
    --------------------------------------------------------
    if not RAINBOW_DRAGON_CLIENT_REGISTERED and Events and Events.SubscribeRemote then
        RAINBOW_DRAGON_CLIENT_REGISTERED = true

        -- Le serveur prévient le client quand le joueur est assis et prêt
        Events.SubscribeRemote("RainbowDragonReady", function()
            if not Client or not Client.GetLocalPlayer then return end

            local localPlayer = nil
            pcall(function()
                localPlayer = Client.GetLocalPlayer()
            end)

            if not localPlayer then return end

            local takeoffSent = false

            ----------------------------------------------------
            -- MÉMORISE LES RÉGLAGES CAMÉRA D'ORIGINE
            -- pour pouvoir les remettre EXACTEMENT à la fin.
            ----------------------------------------------------
            local originalArmLength = nil
            local originalDistance = nil
            local originalFOV = nil

            pcall(function()
                originalArmLength = localPlayer:GetCameraArmLength()
            end)

            pcall(function()
                originalDistance = localPlayer:GetCameraDistance()
            end)

            pcall(function()
                originalFOV = localPlayer:GetCameraFOV()
            end)

            ----------------------------------------------------
            -- CAMÉRA QUI RECULE DÈS QUE LE JOUEUR EST MONTÉ
            ----------------------------------------------------
            pcall(function()
                localPlayer:SetCameraArmLength(MOUNTED_CAMERA_DISTANCE)
            end)

            pcall(function()
                localPlayer:SetCameraDistance(MOUNTED_CAMERA_DISTANCE)
            end)

            ----------------------------------------------------
            -- Envoi continu de la direction de caméra (visée du vol)
            ----------------------------------------------------
            local aimInterval = nil

            aimInterval = Timer.SetInterval(function()
                local camRot = nil
                pcall(function()
                    camRot = localPlayer:GetCameraRotation()
                end)

                if not camRot then return end

                local forward = NormalizeVector(camRot:GetForwardVector())

                pcall(function()
                    Events.CallRemote(
                        "RainbowDragonUpdateAim",
                        forward.X,
                        forward.Y,
                        forward.Z
                    )
                end)
            end, 30)

            ----------------------------------------------------
            -- Détection de la touche avancer
            -- AZERTY = "Z", QWERTY = "W", flèche = "Up"
            ----------------------------------------------------
            local forwardKeys = { "Z", "W", "Up" }

            local function IsForwardPressed()
                if not Input or not Input.IsKeyDown then return false end

                for _, key in ipairs(forwardKeys) do
                    local down = false
                    pcall(function()
                        down = Input.IsKeyDown(key)
                    end)
                    if down then return true end
                end

                return false
            end

            local inputInterval = nil

            inputInterval = Timer.SetInterval(function()
                if takeoffSent then return end

                if IsForwardPressed() then
                    takeoffSent = true

                    pcall(function()
                        Events.CallRemote("RainbowDragonTakeOff")
                    end)

                    Console.Log("Rainbow Dragon : touche avancer détectée, décollage demandé")
                end
            end, 30)

            ----------------------------------------------------
            -- Le serveur demande l'arrêt du contrôle (fin du sort)
            ----------------------------------------------------
            Events.SubscribeRemote("RainbowDragonStopControl", function()
                if aimInterval then
                    pcall(function()
                        Timer.ClearInterval(aimInterval)
                    end)
                    aimInterval = nil
                end

                if inputInterval then
                    pcall(function()
                        Timer.ClearInterval(inputInterval)
                    end)
                    inputInterval = nil
                end

                ------------------------------------------------
                -- REMET LA CAMÉRA EXACTEMENT COMME AVANT LE SORT
                ------------------------------------------------
                pcall(function()
                    localPlayer:SetCameraArmLength(originalArmLength or DEFAULT_CAMERA_DISTANCE)
                end)

                pcall(function()
                    localPlayer:SetCameraDistance(originalDistance or DEFAULT_CAMERA_DISTANCE)
                end)

                if originalFOV then
                    pcall(function()
                        localPlayer:SetCameraFOV(originalFOV)
                    end)
                end
            end)
        end)
    end

    --------------------------------------------------------
    -- ENREGISTREMENT DU SORT
    --------------------------------------------------------
    SpellRegistry.Register({
        id       = "rainbow_dragon",
        name     = "Rainbow Dragon",
        desc     = "Invoque un dragon arc-en-ciel montable que le joueur pilote dans les airs pendant 30 secondes.",
        clan     = "gojo",
        category = "Clan",
        type     = "buff",

        damage   = 0,
        cost     = 60,
        cooldown = 30,
        rang     = "A",
        range    = 0,
        iconUrl  = "https://i.imgur.com/fYhbRv8.jpeg",

        ----------------------------------------------------
        -- ClientCast : direction de caméra de départ
        ----------------------------------------------------
        ClientCast = function(self, char, player, _)
            if not player then return nil end

            local rot = nil
            pcall(function()
                rot = player:GetCameraRotation()
            end)

            if not rot then return nil end

            local forward = NormalizeVector(rot:GetForwardVector())

            return {
                dirX = forward.X,
                dirY = forward.Y,
                dirZ = forward.Z
            }
        end,

        ----------------------------------------------------
        -- Cast serveur
        ----------------------------------------------------
        Cast = function(sp, caster, data)
            local char = GetValidChar(caster)
            if not char then return end

            -- Empêche d'invoquer deux dragons en même temps
            if RAINBOW_DRAGON_STATE[caster] then
                Console.Log("Rainbow Dragon : un dragon est déjà actif pour ce joueur")
                return
            end

            local loc = SafeGetLocation(char)
            local rot = SafeGetRotation(char)

            if not loc then return end

            local forward = NormalizeVector(rot:GetForwardVector())

            ------------------------------------------------
            -- DIRECTION DE DÉPART (caméra si dispo)
            ------------------------------------------------
            if data and data.dirX and data.dirY and data.dirZ then
                forward = NormalizeVector(Vector(data.dirX, data.dirY, data.dirZ))
            end

            ------------------------------------------------
            -- 1) APPARITION DU DRAGON
            -- Toujours juste À CÔTÉ du joueur et AU SOL,
            -- peu importe l'endroit où le sort est lancé.
            ------------------------------------------------
            -- Vecteur "côté droit" du joueur (perpendiculaire à sa direction)
            local rightDir = NormalizeVector(Vector(forward.Y, -forward.X, 0))

            -- Point à côté du joueur, puis on cherche le sol exact en dessous.
            local sideLoc = loc + rightDir * DRAGON_SPAWN_SIDE
            local footZ = loc.Z - CASTER_HALF_HEIGHT

            local spawnLoc = GetGroundLocation(sideLoc, footZ)

            -- Le dragon regarde dans la même direction que le joueur
            local spawnRot = RotationFromDirection(Vector(forward.X, forward.Y, 0))

            local dragon = nil

            local okDragon, errDragon = pcall(function()
                dragon = Character(
                    spawnLoc,
                    spawnRot,
                    DRAGON_MESH
                )
            end)

            if not okDragon or not dragon then
                Console.Log("Rainbow Dragon : erreur spawn dragon : " .. tostring(errDragon))
                return
            end

            -- Le dragon reste immobile tant qu'il n'a pas décollé
            SafeSetGravity(dragon, false)
            SafeSetVelocity(dragon, Vector(0, 0, 0))

            Console.Log("Rainbow Dragon : dragon invoqué (statique)")

            ------------------------------------------------
            -- MÉMORISE L'ÉTAT
            ------------------------------------------------
            RAINBOW_DRAGON_STATE[caster] = {
                dragon       = dragon,
                char         = char,
                mounted      = false,
                flying       = false,
                attached     = false,
                flyInterval  = nil,
                lifetimeTimer = nil
            }

            ------------------------------------------------
            -- 2) ANIMATION : LE JOUEUR MONTE SUR LE DRAGON
            ------------------------------------------------
            SafePlayAnimation(char, PLAYER_MOUNT_ANIM, "monterdragon")

            ------------------------------------------------
            -- 3) FIN DE LA MONTÉE : LE JOUEUR S'ASSOIT
            ------------------------------------------------
            Timer.SetTimeout(function()
                local state = RAINBOW_DRAGON_STATE[caster]
                if not state or not state.dragon then return end

                SeatPlayerOnDragon(char, state.dragon)

                state.mounted = true
                state.attached = true

                Console.Log("Rainbow Dragon : joueur assis sur le dragon, prêt à décoller")

                -- Prévient le client : il peut maintenant piloter
                pcall(function()
                    if Events and Events.CallRemote and caster then
                        Events.CallRemote("RainbowDragonReady", caster)
                    end
                end)
            end, MOUNT_TIME_MS)

            ------------------------------------------------
            -- 4) DISPARITION AUTOMATIQUE APRÈS 30 SECONDES
            ------------------------------------------------
            RAINBOW_DRAGON_STATE[caster].lifetimeTimer = Timer.SetTimeout(function()
                CleanupDragon(caster)
            end, DRAGON_LIFETIME_MS)
        end,
    })
end)()
