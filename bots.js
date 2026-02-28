"use strict";

// === Armor durability randomizer configuration (edit values here) ===
// chance: percent chance (0-100) a PMC's armor will be randomized
// rangePercent: percent range (0-100) to vary durability from template max.
// Example: rangePercent = 30 => final durability is between 70% and 100% of template max
const ArmorDurabilityRandomizerConfig = {
    chance: 40,
    rangePercent: 15
};

class Controller
{
	generatePlayerScav() {
		let scavData = bots_f.botHandler.generate({ "conditions": [{ "Role": "playerScav", "Limit": 1, "Difficulty": "normal" }] });
		let scavItems = scavData[0].Inventory.items;

		// Remove secured container
		for (let item of scavItems) {
			if (item.slotId === "SecuredContainer") {
				let toRemove = helper_f.findAndReturnChildrenByItems(scavItems, item._id);
				let n = scavItems.length;

				while (n-- > 0) {
					if (toRemove.includes(scavItems[n]._id)) {
						scavItems.splice(n, 1);
					}
				}

				break;
			}
		}

		scavData[0].Info.Settings = {};
		return scavData[0];
	}
	
    getBotLimit(type) {
		if(typeof global._database.gameplayConfig.bots.limits[(type === "cursedAssault" || type === "assaultGroup") ? "assault" : type] == "undefined") return 30;
        return global._database.gameplayConfig.bots.limits[(type === "cursedAssault" || type === "assaultGroup") ? "assault" : type];
    }
    getBotDifficulty(type, difficulty) {
        switch (type)
        {
            // requested difficulty shared among bots
            case "core":
                return global._database.core.botCore;

            // don't replace type
            default:
				return global._database.bots[type].difficulty[difficulty];
                break;
        }
    }

    generateId(bot) {
        const botId = utility.generateNewAccountId();
        bot._id = botId;
        bot.aid = botId;
        return bot;
    }

    generateBot(bot, role) {
        // generate bot
        const node = global._database.bots[role.toLowerCase()];
        const levelResult = bots_f.botHandler.generateRandomLevel(node.experience.level.min, node.experience.level.max);

        bot.Info.Nickname = utility.getArrayValue(node.names);
        bot.Info.experience = levelResult.exp;
        bot.Info.Level = levelResult.level;
        bot.Info.Settings.Experience = utility.getRandomInt(node.experience.reward.min, node.experience.reward.max);
        bot.Info.Voice = utility.getArrayValue(node.appearance.voice);
        bot.Health = bots_f.botHandler.generateHealth(node.health);
        bot.Customization.Head = utility.getArrayValue(node.appearance.head);
        bot.Customization.Body = utility.getArrayValue(node.appearance.body);
        bot.Customization.Feet = utility.getArrayValue(node.appearance.feet);
        bot.Customization.Hands = utility.getArrayValue(node.appearance.hands);
        bot.Inventory = bots_f.generator.generateInventory(node.inventory, node.chances, node.generation);

        // ---- Armor durability randomizer for PMC body armor / armored rigs (not helmets) ----
        try {
            const cfg = (global && global._database && global._database.gameplayConfig && global._database.gameplayConfig.bots && global._database.gameplayConfig.bots.randomizeArmorDurability) || ArmorDurabilityRandomizerConfig;
            const chance = Number.isFinite(cfg.chance) ? cfg.chance : ArmorDurabilityRandomizerConfig.chance;
            const rangePercent = Number.isFinite(cfg.rangePercent) ? cfg.rangePercent : ArmorDurabilityRandomizerConfig.rangePercent;

            if ((bot.Info.Side === "Usec" || bot.Info.Side === "Bear") && utility.getRandomIntEx(100) <= chance) {
                for (const item of bot.Inventory.items) {
                    // only target body armor / armored rigs, skip helmets (Headwear) and other slots
                    if (item.slotId !== EquipmentSlots.ArmorVest && item.slotId !== EquipmentSlots.TacticalVest) continue;

                    const tpl = global._database.items[item._tpl];
                    if (!tpl || !tpl._props || typeof tpl._props.MaxDurability !== "number") continue;

                    const tplMax = tpl._props.MaxDurability;
                    const pct = Math.max(0, Math.min(100, rangePercent));
                    const minVal = Math.max(1, Math.floor(tplMax * (100 - pct) / 100));
                    const newDur = utility.getRandomInt(minVal, tplMax);

                    item.upd = item.upd || {};
                    item.upd.Repairable = item.upd.Repairable || {};
                    item.upd.Repairable.Durability = Math.min(newDur, tplMax);
                    item.upd.Repairable.MaxDurability = Math.min(newDur, tplMax);
                }
            }
        }
        catch (e) {
            logger.logError && logger.logError(`armor durability randomize error: ${e && e.message}`);
        }
        // ---- end randomizer ----

        // add dogtag to PMC's
        if (role === "usec" || role === "bear")
        {
            bot = bots_f.botHandler.generateDogtag(bot);
        }

        // generate new bot ID
        bot = bots_f.botHandler.generateId(bot);

        // generate new inventory ID
        bot = utility.generateInventoryID(bot);

        return bot;
    }

    generate(info)
    {
        let output = [];

        for (const condition of info.conditions)
        {
            for (let i = 0; i < condition.Limit; i++)
            {
                const pmcSide = (utility.getRandomInt(0, 99) < global._database.gameplayConfig.bots.pmc.usecChance) ? "Usec" : "Bear";
                const role = condition.Role;
                const isPmc = (role in global._database.gameplayConfig.bots.pmc.types && utility.getRandomInt(0, 99) < global._database.gameplayConfig.bots.pmc.types[role]);
                let bot = utility.wipeDepend(global._database.core.botBase);

                bot.Info.Settings.BotDifficulty = condition.Difficulty;
                bot.Info.Settings.Role = role;
                bot.Info.Side = (isPmc) ? pmcSide : "Savage";
                bot = bots_f.botHandler.generateBot(bot, (isPmc) ? pmcSide.toLowerCase() : role.toLowerCase());

                output.unshift(bot);
            }
        }

        return output;
    }

    generateRandomLevel(min, max)
    {
        const expTable = global._database.globals.config.exp.level.exp_table;
        const maxLevel = Math.min(max, expTable.length);

        // Get random level based on the exp table.
        let exp = 0;
        let level = utility.getRandomInt(min, maxLevel);

        for (let i = 0; i < level; i++)
        {
            exp += expTable[i].exp;
        }

        // Sprinkle in some random exp within the level, unless we are at max level.
        if (level < expTable.length - 1)
        {
            exp += utility.getRandomInt(0, expTable[level].exp - 1);
        }

        return {level, exp};
    }

    /** Converts health object to the required format */
    generateHealth(healthObj)
    {
        return {
            "Hydration": {
                "Current": utility.getRandomInt(healthObj.Hydration.min, healthObj.Hydration.max),
                "Maximum": healthObj.Hydration.max
            },
            "Energy": {
                "Current": utility.getRandomInt(healthObj.Energy.min, healthObj.Energy.max),
                "Maximum": healthObj.Energy.max
            },
            "Temperature": {
                "Current": utility.getRandomInt(healthObj.Temperature.min, healthObj.Temperature.max),
                "Maximum": healthObj.Temperature.max
            },
            "BodyParts": {
                "Head": {
                    "Health": {
                        "Current": utility.getRandomInt(healthObj.BodyParts.Head.min, healthObj.BodyParts.Head.max),
                        "Maximum": healthObj.BodyParts.Head.max
                    }
                },
                "Chest": {
                    "Health": {
                        "Current": utility.getRandomInt(healthObj.BodyParts.Chest.min, healthObj.BodyParts.Chest.max),
                        "Maximum": healthObj.BodyParts.Chest.max
                    }
                },
                "Stomach": {
                    "Health": {
                        "Current": utility.getRandomInt(healthObj.BodyParts.Stomach.min, healthObj.BodyParts.Stomach.max),
                        "Maximum": healthObj.BodyParts.Stomach.max
                    }
                },
                "LeftArm": {
                    "Health": {
                        "Current": utility.getRandomInt(healthObj.BodyParts.LeftArm.min, healthObj.BodyParts.LeftArm.max),
                        "Maximum": healthObj.BodyParts.LeftArm.max
                    }
                },
                "RightArm": {
                    "Health": {
                        "Current": utility.getRandomInt(healthObj.BodyParts.RightArm.min, healthObj.BodyParts.RightArm.max),
                        "Maximum": healthObj.BodyParts.RightArm.max
                    }
                },
                "LeftLeg": {
                    "Health": {
                        "Current": utility.getRandomInt(healthObj.BodyParts.LeftLeg.min, healthObj.BodyParts.LeftLeg.max),
                        "Maximum": healthObj.BodyParts.LeftLeg.max
                    }
                },
                "RightLeg": {
                    "Health": {
                        "Current": utility.getRandomInt(healthObj.BodyParts.RightLeg.min, healthObj.BodyParts.RightLeg.max),
                        "Maximum": healthObj.BodyParts.RightLeg.max
                    }
                }
            }
        };
    }

    generateDogtag(bot)
    {
        bot.Inventory.items.push({
            _id: utility.generateNewItemId(),
            _tpl: ((bot.Info.Side === "Usec") ? "59f32c3b86f77472a31742f0" : "59f32bb586f774757e1e8442"),
            parentId: bot.Inventory.equipment,
            slotId: "Dogtag",
            upd: {
                "Dogtag": {
                    "AccountId": bot.aid,
                    "ProfileId": bot._id,
                    "Nickname": bot.Info.Nickname,
                    "Side": bot.Info.Side,
                    "Level": bot.Info.Level,
                    "Time": (new Date().toISOString()),
                    "Status": "Killed by ",
                    "KillerAccountId": "Unknown",
                    "KillerProfileId": "Unknown",
                    "KillerName": "Unknown",
                    "WeaponName": "Unknown"
                }
            }
        });

        return bot;
    }
}

const EquipmentSlots = {
    Headwear: "Headwear",
    Earpiece: "Earpiece",
    FaceCover: "FaceCover",
    ArmorVest: "ArmorVest",
    Eyewear: "Eyewear",
    ArmBand: "ArmBand",
    TacticalVest: "TacticalVest",
    Pockets: "Pockets",
    Backpack: "Backpack",
    SecuredContainer: "SecuredContainer",
    FirstPrimaryWeapon: "FirstPrimaryWeapon",
    SecondPrimaryWeapon: "SecondPrimaryWeapon",
    Holster: "Holster",
    Scabbard: "Scabbard"
};

class Generator
{
    constructor()
    {
        this.inventory = {};

        // Medicine pools and tactical-vest compatibility
        this.medPools = {
            healingItems: [
                "544fb45d4bdc2dee738b4568",
                "590c657e86f77412b013051d",
                "590c661e86f7741e566b646a",
                "590c678286f77426c9660122"
            ],
            painkillerItems: [
                "5af0548586f7743a532b7e99",
                "544fb37f4bdc2dee738b4567",
                "5755383e24597772cb798966",
                "5751a89d24597722aa0e8db0",
                "544fb3f34bdc2d03748b456a"
            ],
            stimulatorItems: [
                "5c0e531286f7747fa54205c2",
                "5c0e531d86f7747fa23f4d42",
                "5c0e530286f7747fa1419862",
                "5c0e534186f7747fa1419867",
                "5ed515c8d380ab312177c0fa",
                "5ed515ece452db0eb56fc028",
                "5ed515f6915ec335206e4152",
                "5ed51652f6c34d2cc26336a1",
                "5fca13ca637ee0341a484f46",
                "5ed5166ad380ab312177c100",
                "5c10c8fd86f7743d7d706df3",
                "5fca138c2a7b221b2852a5c6",
                "5ed5160a87bb8443d10680b5"
            ],
            bandageItems: [
                "5e8488fa988a8701445df1e4",
                "5751a25924597722c463c472",
                "544fb25a4bdc2dfb738b4567",
                "5e831507ea0a7c419c2f9bd9",
                "5c0e533786f7747fa23f4d47"
            ],
            surgeryItems: [
                "5d02778e86f774203e7dedbe",
                "5d02797c86f774203f38e30a"
            ],
            // Bots sometimes wont generate with (healingItems) due to trying to generate a grizzly medical kit into an incompatible vest so we will need a workaround
            // Tut: Select an id (healingItem) then list all compatible tactical vests for it
            // Note: there is 100% a better way to do this but im lazy
            vestCompatibility: {
                "590c657e86f77412b013051d": [
                    "5648a69d4bdc2ded0b8b457b",
                    "5e9db13186f7742f845ee9d3",
                    "592c2d1a86f7746dbe2af32a",
                    "5c0e722886f7740458316a57",
                    "5c0e746986f7741453628fe5",
                    "5e4ac41886f77406a511c9a8",
                    "tv110_black",
                    "dgarscpc"
                ]
            }
        };

            // Optional: force a specific ammo for certain weapon tpl ids
            // Tut: Select an id (weapon) then list ammo to use
        this.preferredAmmo = {
            "5fbcc1d9016cce60e8341ab3": [
                "5fd20ff893a8961fc660a954"
            ]
        };

        // Optional: configure percent chance to NOT generate a rear sight (mod_sight_rear)
        // Structure: { "<weapon_tpl>": { "<mod_handguard_tpl>": <percentToSkipRearSight> (0-100), ... }, ... }
        this.rearSightSkipConfig = {
            "5bb2475ed4351e00853264e3": {
                "5c6d11152e2216000f2003e7": 70
            },
            "606587252535c57a13424cfd": {
                "5a329052c4a28200741e22d3": 50,
                "5f6336bbda967c74a42e9932": 50
            }
        };
    }

    generateInventory(templateInventory, equipmentChances, generation)
    {
        // Generate base inventory with no items
        this.inventory = bots_f.generator.generateInventoryBase();

        // Go over all defined equipment slots and generate an item for each of them
        const excludedSlots = [
            EquipmentSlots.FirstPrimaryWeapon,
            EquipmentSlots.SecondPrimaryWeapon,
            EquipmentSlots.Holster,
            EquipmentSlots.ArmorVest
        ];

        for (const equipmentSlot in templateInventory.equipment)
        {
            // Weapons have special generation and will be generated seperately; ArmorVest should be generated after TactivalVest
            if (excludedSlots.includes(equipmentSlot))
            {
                continue;
            }
            bots_f.generator.generateEquipment(equipmentSlot, templateInventory.equipment[equipmentSlot], templateInventory.mods, equipmentChances);
        }

        // ArmorVest is generated afterwards to ensure that TacticalVest is always first, in case it is incompatible
        bots_f.generator.generateEquipment(EquipmentSlots.ArmorVest, templateInventory.equipment.ArmorVest, templateInventory.mods, equipmentChances);

        // Roll weapon spawns and generate a weapon for each roll that passed
        const shouldSpawnPrimary = utility.getRandomIntEx(100) <= equipmentChances.equipment.FirstPrimaryWeapon;
        const weaponSpawns = [
            {
                slot: EquipmentSlots.FirstPrimaryWeapon,
                shouldSpawn: shouldSpawnPrimary
            },
            { // Only roll for a chance at secondary if primary roll was successful
                slot: EquipmentSlots.SecondPrimaryWeapon,
                shouldSpawn: shouldSpawnPrimary ? utility.getRandomIntEx(100) <= equipmentChances.equipment.SecondPrimaryWeapon : false
            },
            { // Roll for an extra pistol, unless primary roll failed - in that case, pistol is guaranteed
                slot: EquipmentSlots.Holster,
                shouldSpawn: shouldSpawnPrimary ? utility.getRandomIntEx(100) <= equipmentChances.equipment.Holster : true
            }
        ];

        for (const weaponSpawn of weaponSpawns)
        {
            if (weaponSpawn.shouldSpawn && templateInventory.equipment[weaponSpawn.slot].length)
            {
                bots_f.generator.generateWeapon(
                    weaponSpawn.slot,
                    templateInventory.equipment[weaponSpawn.slot],
                    templateInventory.mods,
                    equipmentChances.mods,
                    generation.items.magazines);
            }
        }

        bots_f.generator.generateLoot(templateInventory.items, generation.items);

        return utility.wipeDepend(this.inventory);
    }

    generateInventoryBase()
    {
        const equipmentId = utility.generateNewItemId();
        const equipmentTpl = "55d7217a4bdc2d86028b456d";

        const stashId = utility.generateNewItemId();
        const stashTpl = "566abbc34bdc2d92178b4576";

        const questRaidItemsId = utility.generateNewItemId();
        const questRaidItemsTpl = "5963866286f7747bf429b572";

        const questStashItemsId = utility.generateNewItemId();
        const questStashItemsTpl = "5963866b86f7747bfa1c4462";

        return {
            "items": [
                {
                    "_id": equipmentId,
                    "_tpl": equipmentTpl
                },
                {
                    "_id": stashId,
                    "_tpl": stashTpl
                },
                {
                    "_id": questRaidItemsId,
                    "_tpl": questRaidItemsTpl
                },
                {
                    "_id": questStashItemsId,
                    "_tpl": questStashItemsTpl
                }
            ],
            "equipment": equipmentId,
            "stash": stashId,
            "questRaidItems": questRaidItemsId,
            "questStashItems": questStashItemsId,
            "fastPanel": {}
        };
    }

    generateEquipment(equipmentSlot, equipmentPool, modPool, spawnChances)
    {
        const spawnChance = [EquipmentSlots.Pockets, EquipmentSlots.SecuredContainer].includes(equipmentSlot)
            ? 100
            : spawnChances.equipment[equipmentSlot];
        if (typeof spawnChance === "undefined")
        {
            logger.logWarning(`No spawn chance was defined for ${equipmentSlot}`);
            return;
        }

        const shouldSpawn = utility.getRandomIntEx(100) <= spawnChance;
        if (equipmentPool.length && shouldSpawn)
        {
            const id = utility.generateNewItemId();
            const tpl = utility.getArrayValue(equipmentPool);
            const itemTemplate = global._database.items[tpl];

            if (!itemTemplate)
            {
                logger.logError(`Could not find item template with tpl ${tpl}`);
                logger.logInfo(`EquipmentSlot -> ${equipmentSlot}`);
                return;
            }

            if (bots_f.generator.isItemIncompatibleWithCurrentItems(this.inventory.items, tpl, equipmentSlot))
            {
                // Bad luck - randomly picked item was not compatible with current gear
                return;
            }

            const item = {
                "_id": id,
                "_tpl": tpl,
                "parentId": this.inventory.equipment,
                "slotId": equipmentSlot,
                ...bots_f.generator.generateExtraPropertiesForItem(itemTemplate)
            };

            if (Object.keys(modPool).includes(tpl))
            {
                const items = bots_f.generator.generateModsForItem([item], modPool, id, itemTemplate, spawnChances.mods);
                this.inventory.items.push(...items);
            }
            else
            {
                this.inventory.items.push(item);
            }
        }
    }

    generateWeapon(equipmentSlot, weaponPool, modPool, modChances, magCounts)
    {
        const id = utility.generateNewItemId();
        const tpl = utility.getArrayValue(weaponPool);
        const itemTemplate = global._database.items[tpl];

        if (!itemTemplate)
        {
            logger.logError(`Could not find item template with tpl ${tpl}`);
            logger.logError(`WeaponSlot -> ${equipmentSlot}`);
            return;
        }

        let weaponMods = [{
            "_id": id,
            "_tpl": tpl,
            "parentId": this.inventory.equipment,
            "slotId": equipmentSlot,
            ...bots_f.generator.generateExtraPropertiesForItem(itemTemplate)
        }];

        if (Object.keys(modPool).includes(tpl))
        {
            weaponMods = bots_f.generator.generateModsForItem(weaponMods, modPool, id, itemTemplate, modChances);
        }

        // Apply rearSightSkipConfig: if configured for this weapon and the generated handguard matches,
        // remove any mod_sight_rear from the generated weapon (honor configured percent skip).
        try {
            const skipCfg = this.rearSightSkipConfig[tpl];
            if (skipCfg && Array.isArray(weaponMods) && weaponMods.length) {
                const handguard = weaponMods.find(m => m.slotId === "mod_handguard");
                if (handguard) {
                    const hgTpl = handguard._tpl;
                    const skipPercent = skipCfg[hgTpl];
                    if (typeof skipPercent !== "undefined") {
                        const roll = utility.getRandomIntEx(100);
                        if (roll <= skipPercent) {
                            weaponMods = weaponMods.filter(m => m.slotId !== "mod_sight_rear");
                            logger.logDebug && logger.logDebug(`Removed mod_sight_rear from ${tpl} due to handguard ${hgTpl} (roll ${roll} <= ${skipPercent})`);
                        }
                    }
                }
            }
        }
        catch (e) {
            logger.logError && logger.logError(`rearSightSkipConfig check failed for ${tpl}: ${e && e.message}`);
        }

        // Find ammo to use when filling magazines
        const ammoTpl = bots_f.generator.getCompatibleAmmo(weaponMods, itemTemplate);

        // Fill existing magazines to full and sync ammo type
        for (const mod of weaponMods.filter(mod => mod.slotId === "mod_magazine"))
        {
            bots_f.generator.fillExistingMagazines(weaponMods, mod, ammoTpl);
        }

        this.inventory.items.push(...weaponMods);

        // Generate extra magazines and attempt add them to TacticalVest or Pockets
        bots_f.generator.generateExtraMagazines(weaponMods, itemTemplate, magCounts, ammoTpl);
    }

    generateModsForItem(items, modPool, parentId, parentTemplate, modSpawnChances)
    {
        const itemModPool = modPool[parentTemplate._id];

        if (!parentTemplate._props.Slots.length
            && !parentTemplate._props.Cartridges.length
            && !parentTemplate._props.Chambers.length)
        {
            logger.logError(`Item ${parentTemplate._id} had mods defined, but no slots to support them`);
            return items;
        }

        const modSlots = Object.keys(itemModPool);
        // ensure handguard generated before rear sight
        modSlots.sort((a,b) => {
            if (a === "mod_handguard") return -1;
            if (b === "mod_handguard") return 1;
            if (a === "mod_sight_rear") return 1;
            if (b === "mod_sight_rear") return -1;
            return 0;
        });

        for (const modSlot of modSlots)
        {
            let itemSlot;
            switch (modSlot)
            {
                case "patron_in_weapon":
                    // TODO: can cause a bug of Big Guns!!!
                    itemSlot = parentTemplate._props.Chambers.find(c => c._name === modSlot);
                    break;
                case "cartridges":
                    itemSlot = parentTemplate._props.Cartridges.find(c => c._name === modSlot);
                    break;
                default:
                    itemSlot = parentTemplate._props.Slots.find(s => s._name === modSlot);
                    break;
            }

            // --- New: optionally skip rear sight generation for specific weapon+handguard combos ---
            if (modSlot === "mod_sight_rear")
            {
                try
                {
                    const weaponTplId = parentTemplate._id;
                    const cfg = this.rearSightSkipConfig[weaponTplId];
                    if (cfg && Object.keys(cfg).length)
                    {
                        // Find any already-generated handguard mod on this parent (if present)
                        const handguardItem = items.find(i => i.parentId === parentId && i.slotId === "mod_handguard");
                        if (handguardItem && cfg[handguardItem._tpl])
                        {
                            const skipPercent = cfg[handguardItem._tpl] || 0;
                            // If roll indicates skip, do not generate this rear sight
                            if (utility.getRandomIntEx(100) <= skipPercent)
                            {
                                continue;
                            }
                        }
                    }
                }
                catch (e)
                {
                    logger.logError(`rearSight skip check error: ${e.message}`);
                }
            }
            // --- end new logic ---

            if (!itemSlot)
            {
                logger.logError(`Slot '${modSlot}' does not exist for item ${parentTemplate._id}`);
                continue;
            }

            const modSpawnChance = itemSlot._required || ["mod_magazine", "patron_in_weapon", "cartridges"].includes(modSlot)
                ? 100
                : modSpawnChances[modSlot];
            if (utility.getRandomIntEx(100) > modSpawnChance)
            {
                continue;
            }

            const exhaustableModPool = new ExhaustableArray(itemModPool[modSlot]);

            let modTpl;
            let found = false;
            while (exhaustableModPool.hasValues())
            {
                modTpl = exhaustableModPool.getRandomValue();
                if (!bots_f.generator.isItemIncompatibleWithCurrentItems(items, modTpl, modSlot))
                {
                    found = true;
                    break;
                }
            }

            if (!found || !modTpl)
            {
                if (itemSlot._required)
                {
                    logger.logError(`Could not locate any compatible items to fill '${modSlot}' for ${parentTemplate._id}`);
                }
                continue;
            }

            if (!itemSlot._props.filters[0].Filter.includes(modTpl))
            {
                logger.logError(`Mod ${modTpl} is not compatible with slot '${modSlot}' for item ${parentTemplate._id}`);
                continue;
            }

            const modTemplate = global._database.items[modTpl];
            if (!modTemplate)
            {
                logger.logError(`Could not find mod item template with tpl ${modTpl}`);
                logger.logInfo(`Item -> ${parentTemplate._id}; Slot -> ${modSlot}`);
                continue;
            }

            const modId = utility.generateNewItemId();
            items.push({
                "_id": modId,
                "_tpl": modTpl,
                "parentId": parentId,
                "slotId": modSlot,
                ...bots_f.generator.generateExtraPropertiesForItem(modTemplate)
            });

            if (Object.keys(modPool).includes(modTpl))
            {
                bots_f.generator.generateModsForItem(items, modPool, modId, modTemplate, modSpawnChances);
            }
        }

        return items;
    }

    generateExtraPropertiesForItem(itemTemplate)
    {
        let properties = {};

        if (itemTemplate._props.MaxDurability)
        {
            properties.Repairable = {"Durability": itemTemplate._props.MaxDurability};
        }

        if (itemTemplate._props.HasHinge)
        {
            properties.Togglable = {"On": true};
        }

        if (itemTemplate._props.Foldable)
        {
            properties.Foldable = {"Folded": false};
        }

        if (itemTemplate._props.weapFireType && itemTemplate._props.weapFireType.length)
        {
            properties.FireMode = {"FireMode": itemTemplate._props.weapFireType[0]};
        }

        if (itemTemplate._props.MaxHpResource)
        {
            properties.MedKit = {"HpResource": itemTemplate._props.MaxHpResource};
        }

        if (itemTemplate._props.MaxResource && itemTemplate._props.foodUseTime)
        {
            properties.FoodDrink = {"HpPercent": itemTemplate._props.MaxResource};
        }

        return Object.keys(properties).length ? {"upd": properties} : {};
    }

    isItemIncompatibleWithCurrentItems(items, tplToCheck, equipmentSlot)
    {
        // TODO: Can probably be optimized to cache itemTemplates as items are added to inventory
        const itemTemplates = items.map(i => global._database.items[i._tpl]);
        const templateToCheck = global._database.items[tplToCheck];

        // Check if any of the current inventory templates have the incoming item defined as incompatible
        const currentInventoryCheck = itemTemplates.some(item => item._props[`Blocks${equipmentSlot}`] || item._props.ConflictingItems.includes(tplToCheck));
        // Check if the incoming item has any inventory items defined as incompatible
        const itemCheck = items.some(item => templateToCheck._props[`Blocks${item.slotId}`] || templateToCheck._props.ConflictingItems.includes(item._tpl));

        return currentInventoryCheck || itemCheck;
    }

    /** Checks if all required slots are occupied on a weapon and all it's mods */
    isWeaponValid(itemList)
    {
        for (const item of itemList)
        {
            const template = global._database.items[item._tpl];
            if (!template._props.Slots || !template._props.Slots.length)
            {
                continue;
            }

            for (const slot of template._props.Slots)
            {
                if (!slot._required)
                {
                    continue;
                }

                const slotItem = itemList.find(i => i.parentId === item._id && i.slotId === slot._name);
                if (!slotItem)
                {
                    logger.logError(`Required slot '${slot._name}' on ${template._id} was empty`);
                    return false;
                }
            }
        }

        return true;
    }

    /** Generates extra magazines or bullets (if magazine is internal) and adds them to TacticalVest and Pockets.
     * Additionally, adds extra bullets to SecuredContainer */
    generateExtraMagazines(weaponMods, weaponTemplate, magCounts, ammoTpl)
    {
        let magazineTpl = "";
        const magazine = weaponMods.find(m => m.slotId === "mod_magazine");
        if (!magazine)
        {
            logger.logWarning(`Generated weapon with tpl ${weaponTemplate._id} had no magazine`);
            magazineTpl = weaponTemplate._props.defMagType;
        }
        else
        {
            magazineTpl = magazine._tpl;
        }

        let magTemplate = global._database.items[magazineTpl];
        if (!magTemplate)
        {
            logger.logError(`Could not find magazine template with tpl ${magazineTpl}`);
            return;
        }

        const range = magCounts.max - magCounts.min;
        const count = bots_f.generator.getBiasedRandomNumber(magCounts.min, magCounts.max, Math.round(range * 0.75), 4);

        if (magTemplate._props.ReloadMagType === "InternalMagazine")
        {
            /* Get the amount of bullets that would fit in the internal magazine
             * and multiply by how many magazines were supposed to be created */
            const bulletCount = magTemplate._props.Cartridges[0]._max_count * count;

            bots_f.generator.addBullets(ammoTpl, bulletCount);
        }
        else if (weaponTemplate._props.ReloadMode === "OnlyBarrel")
        {
            const bulletCount = count;

            bots_f.generator.addBullets(ammoTpl, bulletCount);
        }
        else
        {
            for (let i = 0; i < count; i++)
            {
                const magId = utility.generateNewItemId();
                const magWithAmmo = [
                    {
                        "_id": magId,
                        "_tpl": magazineTpl
                    },
                    {
                        "_id": utility.generateNewItemId(),
                        "_tpl": ammoTpl,
                        "parentId": magId,
                        "slotId": "cartridges",
                        "upd": {"StackObjectsCount": magTemplate._props.Cartridges[0]._max_count}
                    }
                ];

                const success = bots_f.generator.addItemWithChildrenToEquipmentSlot(
                    [EquipmentSlots.TacticalVest, EquipmentSlots.Pockets],
                    magId,
                    magazineTpl,
                    magWithAmmo);

                if (!success && i < magCounts.min)
                {
                    /* We were unable to fit at least the minimum amount of magazines,
                     * so we fallback to default magazine and try again.
                     * Temporary workaround to Killa spawning with no extras if he spawns with a drum mag */

                    if (magazineTpl === weaponTemplate._props.defMagType)
                    {
                        // We were already on default - stop here to prevent infinite looping
                        break;
                    }

                    magazineTpl = weaponTemplate._props.defMagType;
                    magTemplate = global._database.items[magazineTpl];
                    if (!magTemplate)
                    {
                        logger.logError(`Could not find magazine template with tpl ${magazineTpl}`);
                        break;
                    }

                    if (magTemplate._props.ReloadMagType === "InternalMagazine")
                    {
                        break;
                    }

                    i--;
                }
            }
        }

        const ammoTemplate = global._database.items[ammoTpl];
        if (!ammoTemplate)
        {
            logger.logError(`Could not find ammo template with tpl ${ammoTpl}`);
            return;
        }

        // Add 4 stacks of bullets to SecuredContainer
        for (let i = 0; i < 4; i++)
        {
            const id = utility.generateNewItemId();
            bots_f.generator.addItemWithChildrenToEquipmentSlot([EquipmentSlots.SecuredContainer], id, ammoTpl, [{
                "_id": id,
                "_tpl": ammoTpl,
                "upd": {"StackObjectsCount": ammoTemplate._props.StackMaxSize}
            }]);
        }
    }

    addBullets(ammoTpl, bulletCount)
    {
        const ammoItems = utility.splitStack({
            "_id": utility.generateNewItemId(),
            "_tpl": ammoTpl,
            "upd": {"StackObjectsCount": bulletCount}
        });

        for (const ammoItem of ammoItems)
        {
            bots_f.generator.addItemWithChildrenToEquipmentSlot(
                [EquipmentSlots.TacticalVest, EquipmentSlots.Pockets],
                ammoItem._id,
                ammoItem._tpl,
                [ammoItem]);
        }
    }

    /** Finds and returns tpl of ammo that should be used, while making sure it's compatible */
    getCompatibleAmmo(weaponMods, weaponTemplate)
    {
        // Allow forced ammo per-weapon via this.preferredAmmo if defined and compatible
        try
        {
            if (this.preferredAmmo && weaponTemplate && this.preferredAmmo[weaponTemplate._id])
            {
                // preferredAmmo may be a single tpl or an array of tpls
                const forced = Array.isArray(this.preferredAmmo[weaponTemplate._id])
                    ? this.preferredAmmo[weaponTemplate._id]
                    : [this.preferredAmmo[weaponTemplate._id]];

                // Helper to test chamber compatibility
                const chamber = weaponTemplate._props.Chambers && weaponTemplate._props.Chambers[0];
                const chamberAllows = (ammoTpl) =>
                {
                    try
                    {
                        if (!chamber || !chamber._props || !chamber._props.filters) return true;
                        const filter = chamber._props.filters[0] && chamber._props.filters[0].Filter;
                        if (!filter || !filter.length) return true;
                        return filter.includes(ammoTpl);
                    }
                    catch (e)
                    {
                        return false;
                    }
                };

                // Helper to test magazine compatibility (if a magazine mod exists)
                const magMod = weaponMods.find(m => m.slotId === "mod_magazine");
                const magAllows = (ammoTpl) =>
                {
                    try
                    {
                        if (!magMod || !magMod._tpl) return true;
                        const magTemplate = global._database.items[magMod._tpl];
                        if (!magTemplate || !magTemplate._props || !magTemplate._props.Cartridges || !magTemplate._props.Cartridges.length) return true;
                        const cart = magTemplate._props.Cartridges[0];
                        const filter = (cart._props && cart._props.filters && cart._props.filters[0] && cart._props.filters[0].Filter) || cart.filters || null;
                        if (!filter || !filter.length) return true;
                        return filter.includes(ammoTpl);
                    }
                    catch (e)
                    {
                        return false;
                    }
                };

                // Try each preferred ammo in order and pick the first fully compatible option
                for (const prefAmmoTpl of forced)
                {
                    const candidateTpl = prefAmmoTpl;
                    const candidateTemplate = global._database.items[candidateTpl];
                    if (!candidateTemplate) continue;

                    const allowedByChamber = chamberAllows(candidateTpl);
                    const allowedByMag = magAllows(candidateTpl);
                    const equalsDefault = weaponTemplate._props && weaponTemplate._props.defAmmo === candidateTpl;

                    if ((allowedByChamber && allowedByMag) || equalsDefault)
                    {
                        return candidateTpl;
                    }
                }

                // No preferred ammo matched, log and continue to normal selection
                logger.logWarning(`Preferred ammo ${JSON.stringify(forced)} is not compatible with weapon ${weaponTemplate._id}, falling back to normal selection.`);
            }
        }
        catch (e)
        {
            logger.logError(`Error while checking preferredAmmo: ${e.message}`);
        }

        // Existing selection logic (unchanged)
        let ammoTpl = "";
        let ammoToUse = weaponMods.find(mod => mod.slotId === "patron_in_weapon");
        if (!ammoToUse)
        {
            // No bullet found in chamber, search for ammo in magazines instead
            ammoToUse = weaponMods.find(mod => mod.slotId === "cartridges");
            if (!ammoToUse)
            {
                // Still could not locate ammo to use? Fallback to weapon default
                logger.logWarning(`Could not locate ammo to use for ${weaponTemplate._id}, falling back to default -> ${weaponTemplate._props.defAmmo}`);
                // Immediately returns, as default ammo is guaranteed to be compatible
                return weaponTemplate._props.defAmmo;
            }
            else
            {
                ammoTpl = ammoToUse._tpl;
            }
        }
        else
        {
            ammoTpl = ammoToUse._tpl;
        }

        if (weaponTemplate._props.Chambers && weaponTemplate._props.Chambers[0]
            && weaponTemplate._props.Chambers[0]._props && weaponTemplate._props.Chambers[0]._props.filters
            && !weaponTemplate._props.Chambers[0]._props.filters[0].Filter.includes(ammoToUse._tpl))
        {
            // Incompatible ammo was found, return default (can happen with .366 and 7.62x39 weapons)
            return weaponTemplate._props.defAmmo;
        }

        return ammoTpl;
    }

    generateLoot(lootPool, itemCounts)
    {
        // Flatten all individual slot loot pools into one big pool, while filtering out potentially missing templates
        let lootTemplates = [];
        for (const [slot, pool] of Object.entries(lootPool))
        {
            if (!pool || !pool.length)
            {
                continue;
            }
            const poolItems = pool.map(lootTpl => global._database.items[lootTpl]);
            lootTemplates.push(...poolItems.filter(x => !!x));
        }

        // Sort all items by their worth to spawn chance ratio
        lootTemplates.sort((a, b) => bots_f.generator.compareByValue(a, b));

        // Resolve medPools to template arrays (fall back to scanning lootTemplates if medPools missing)
        const resolveIds = (ids) => (ids || []).map(id => global._database.items[id]).filter(Boolean);
        const healingPool = resolveIds(this.medPools.healingItems).length ? resolveIds(this.medPools.healingItems) : lootTemplates.filter(t => "medUseTime" in t._props);
        const painkillerPool = resolveIds(this.medPools.painkillerItems).length ? resolveIds(this.medPools.painkillerItems) : lootTemplates.filter(t => t._props && t._props.Painkiller);
        const stimPool = resolveIds(this.medPools.stimulatorItems).length ? resolveIds(this.medPools.stimulatorItems) : lootTemplates.filter(t => t._props && t._props.Stimulant);
        const bandagePool = resolveIds(this.medPools.bandageItems).length ? resolveIds(this.medPools.bandageItems) : lootTemplates.filter(t => t._props && t._props.Bandage);
        const surgeryPool = resolveIds(this.medPools.surgeryItems).length ? resolveIds(this.medPools.surgeryItems) : lootTemplates.filter(t => t._props && t._props.Surgery);

        // Get all grenades
        const grenadeItems = lootTemplates.filter(template => "ThrowType" in template._props);

        // Choose a single grenade type for this bot — every grenade spawn will be that type.
        let grenadePoolForBot = [];
        if (grenadeItems.length > 0)
        {
            const grenadeIndex = bots_f.generator.getBiasedRandomNumber(0, grenadeItems.length - 1, grenadeItems.length - 1, 3);
            const chosenGrenade = grenadeItems[grenadeIndex];
            if (chosenGrenade) grenadePoolForBot = [chosenGrenade];
        }

        // Get all misc loot items (excluding magazines, bullets, grenades and healing items)
        const lootItems = lootTemplates.filter(template =>
            !("ammoType" in template._props)
            && !("ReloadMagType" in template._props)
            && !("medUseTime" in template._props)
            && !("ThrowType" in template._props));

        // Helper to generate counts while remaining compatible with generation.json structure
        const getCount = (cfg, biasN = 3) =>
        {
            if (!cfg) return 0;
            const min = (typeof cfg.min === "number") ? cfg.min : 0;
            const max = (typeof cfg.max === "number") ? cfg.max : min;
            const range = Math.max(0, max - min);
            return bots_f.generator.getBiasedRandomNumber(min, max, range, biasN);
        };

        const healingItemCount = getCount(itemCounts.healing, 3);
        const painkillerCount = getCount(itemCounts.painkillers, 3);
        const stimCount = getCount(itemCounts.stimulators, 3);
        const bandageCount = getCount(itemCounts.bandages, 3);
        const surgeryCount = getCount(itemCounts.surgery, 3);

        const lootItemCount = getCount(itemCounts.looseLoot, 5);
        const grenadeCount = getCount(itemCounts.grenades, 4);

        // Equipment slot groups
        const medSlots = [EquipmentSlots.TacticalVest, EquipmentSlots.Pockets];
        const surgerySlots = [EquipmentSlots.Backpack]; // surgery only in backpack
        const looseLootSlots = [EquipmentSlots.Backpack]; // loose loot only in backpack per request

        // If minimum >= 1, guarantee placements in compatible areas:
        const guaranteeCategory = (cfg, pool, slots, placeFn) =>
        {
            if (!cfg || !pool || !pool.length) return 0;
            const min = (typeof cfg.min === "number") ? cfg.min : 0;
            if (min < 1) return 0;

            let guaranteed = 0;
            // Attempt to add one item into each compatible slot
            for (const slot of slots)
            {
                placeFn.call(this, pool, slot, 1);
                guaranteed++;
            }
            return guaranteed;
        };

        // Place healing items taking tactical-vest compatibility into account
        // equipmentSlot is a single slot string (e.g. "TacticalVest" or "Pockets")
        const addHealingWithVestCompatibility = (pool, equipmentSlot, count) =>
        {
            if (!pool || !pool.length || count < 1) return;

            // Current tactical vest tpl ids present on the bot
            const currentVests = this.inventory.items.filter(i => i.slotId === EquipmentSlots.TacticalVest).map(i => i._tpl);

            for (let c = 0; c < count; c++)
            {
                if (equipmentSlot === EquipmentSlots.TacticalVest)
                {
                    // Candidate med templates that are compatible with at least one current vest (or have no restriction)
                    const compatible = pool.filter(t =>
                    {
                        const compat = this.medPools.vestCompatibility && this.medPools.vestCompatibility[t._id];
                        if (!compat || !compat.length) return true;
                        return currentVests.some(v => compat.includes(v));
                    });

                    if (compatible.length)
                    {
                        bots_f.generator.addLootFromPool(compatible, [EquipmentSlots.TacticalVest], 1);
                    }
                    else
                    {
                        // No compatible med for present tactical vest(s) - pick a different healing item into pockets instead
                        bots_f.generator.addLootFromPool(pool, [EquipmentSlots.Pockets], 1);
                    }
                }
                else
                {
                    // Pockets - any healing item allowed
                    bots_f.generator.addLootFromPool(pool, [EquipmentSlots.Pockets], 1);
                }
            }
        };

        // Guarantee placements if min >= 1
        guaranteeCategory(itemCounts.healing, healingPool, medSlots, addHealingWithVestCompatibility);
        guaranteeCategory(itemCounts.painkillers, painkillerPool, medSlots, (p, s, n) => bots_f.generator.addLootFromPool(p, [s], n));
        guaranteeCategory(itemCounts.stimulators, stimPool, medSlots, (p, s, n) => bots_f.generator.addLootFromPool(p, [s], n));
        guaranteeCategory(itemCounts.bandages, bandagePool, medSlots, (p, s, n) => bots_f.generator.addLootFromPool(p, [s], n));
        guaranteeCategory(itemCounts.surgery, surgeryPool, surgerySlots, (p, s, n) => bots_f.generator.addLootFromPool(p, [s], n));
        // looseLoot min handled below via backpack-only generation; guarantee handled similarly
        if (itemCounts.looseLoot && itemCounts.looseLoot.min >= 1)
        {
            bots_f.generator.addLootFromPool(lootItems, looseLootSlots, 1);
        }

        // Now compute remaining counts after guaranteed (simple approach: subtract min guaranteed per category)
        const subtractGuaranteed = (cfg, slots) =>
        {
            if (!cfg) return 0;
            const min = (typeof cfg.min === "number") ? cfg.min : 0;
            if (min < 1) return 0;
            return Math.min(slots.length, min);
        };

        const guaranteedHealing = subtractGuaranteed(itemCounts.healing, medSlots);
        const guaranteedPain = subtractGuaranteed(itemCounts.painkillers, medSlots);
        const guaranteedStim = subtractGuaranteed(itemCounts.stimulators, medSlots);
        const guaranteedBandage = subtractGuaranteed(itemCounts.bandages, medSlots);
        const guaranteedSurgery = subtractGuaranteed(itemCounts.surgery, surgerySlots);
        const guaranteedLoose = (itemCounts.looseLoot && itemCounts.looseLoot.min >= 1) ? 1 : 0;

        const remainingHealing = Math.max(0, healingItemCount - guaranteedHealing);
        const remainingPain = Math.max(0, painkillerCount - guaranteedPain);
        const remainingStim = Math.max(0, stimCount - guaranteedStim);
        const remainingBandage = Math.max(0, bandageCount - guaranteedBandage);
        const remainingSurgery = Math.max(0, surgeryCount - guaranteedSurgery);
        const remainingLoose = Math.max(0, lootItemCount - guaranteedLoose);

        // Add remaining items
        if (remainingHealing > 0) addHealingWithVestCompatibility.call(this, healingPool, EquipmentSlots.TacticalVest, Math.ceil(remainingHealing / 2));
        if (remainingHealing > 1) addHealingWithVestCompatibility.call(this, healingPool, EquipmentSlots.Pockets, Math.floor(remainingHealing / 2));

        if (remainingPain > 0) bots_f.generator.addLootFromPool(painkillerPool, medSlots, remainingPain);
        if (remainingStim > 0) bots_f.generator.addLootFromPool(stimPool, medSlots, remainingStim);
        if (remainingBandage > 0) bots_f.generator.addLootFromPool(bandagePool, medSlots, remainingBandage);
        if (remainingSurgery > 0) bots_f.generator.addLootFromPool(surgeryPool, surgerySlots, remainingSurgery);

        // Generate loose loot only in backpack
        if (remainingLoose > 0) bots_f.generator.addLootFromPool(lootItems, looseLootSlots, remainingLoose);

        // Grenades when generated are the all the same for the specific bot
        if (grenadePoolForBot.length > 0 && grenadeCount > 0)
        {
            // Prioritize pockets first, then tactical vest as a fallback
            bots_f.generator.addLootFromPool(grenadePoolForBot, [EquipmentSlots.Pockets, EquipmentSlots.TacticalVest], grenadeCount);
        }
    }

    addLootFromPool(pool, equipmentSlots, count)
    {
        if (pool.length)
        {
            for (let i = 0; i < count; i++)
            {
                const itemIndex = bots_f.generator.getBiasedRandomNumber(0, pool.length - 1, pool.length - 1, 3);
                const itemTemplate = pool[itemIndex];
                const id = utility.generateNewItemId();

                const itemsToAdd = [{
                    "_id": id,
                    "_tpl": itemTemplate._id,
                    ...bots_f.generator.generateExtraPropertiesForItem(itemTemplate)
                }];

                // Fill ammo box
                if (itemTemplate._props.StackSlots && itemTemplate._props.StackSlots.length)
                {
                    itemsToAdd.push({
                        "_id": utility.generateNewItemId(),
                        "_tpl": itemTemplate._props.StackSlots[0]._props.filters[0].Filter[0],
                        "parentId": id,
                        "slotId": "cartridges",
                        "upd": { "StackObjectsCount": itemTemplate._props.StackMaxRandom }
                    });
                }

                bots_f.generator.addItemWithChildrenToEquipmentSlot(equipmentSlots, id, itemTemplate._id, itemsToAdd);
            }
        }
    }

    /** Adds an item with all its childern into specified equipmentSlots, wherever it fits.
     * Returns a `boolean` indicating success. */
    addItemWithChildrenToEquipmentSlot(equipmentSlots, parentId, parentTpl, itemWithChildren)
    {
        for (const slot of equipmentSlots)
        {
            const container = this.inventory.items.find(i => i.slotId === slot);
            if (!container)
            {
                continue;
            }

            const containerTemplate = global._database.items[container._tpl];
            if (!containerTemplate)
            {
                logger.logError(`Could not find container template with tpl ${container._tpl}`);
                continue;
            }

            if (!containerTemplate._props.Grids || !containerTemplate._props.Grids.length)
            {
                // Container has no slots to hold items
                continue;
            }

            const itemSize = helper_f.getItemSize(parentTpl, parentId, itemWithChildren);

            for (const slot of containerTemplate._props.Grids)
            {
                const containerItems = this.inventory.items.filter(i => i.parentId === container._id && i.slotId === slot._name);
                const slotMap = helper_f.getContainerMap(slot._props.cellsH, slot._props.cellsV, containerItems, container._id);
                const findSlotResult = helper_f.findSlotForItem(slotMap, itemSize[0], itemSize[1]);

                if (findSlotResult.success)
                {
                    const parentItem = itemWithChildren.find(i => i._id === parentId);
                    parentItem.parentId = container._id;
                    parentItem.slotId = slot._name;
                    parentItem.location = {
                        "x": findSlotResult.x,
                        "y": findSlotResult.y,
                        "r": findSlotResult.rotation ? 1 : 0
                    };
                    this.inventory.items.push(...itemWithChildren);
                    return true;
                }
            }
        }

        return false;
    }

    getBiasedRandomNumber(min, max, shift, n)
    {
        /* To whoever tries to make sense of this, please forgive me - I tried my best at explaining what goes on here.
         * This function generates a random number based on a gaussian distribution with an option to add a bias via shifting.
         *
         * Here's an example graph of how the probabilities can be distributed:
         * https://www.boost.org/doc/libs/1_49_0/libs/math/doc/sf_and_dist/graphs/normal_pdf.png
         * Our parameter 'n' is sort of like σ (sigma) in the example graph.
         *
         * An 'n' of 1 means all values are equally likely. Increasing 'n' causes numbers near the edge to become less likely.
         * By setting 'shift' to whatever 'max' is, we can make values near 'min' very likely, while values near 'max' become extremely unlikely.
         *
         * Here's a place where you can play around with the 'n' and 'shift' values to see how the distribution changes:
         * http://jsfiddle.net/e08cumyx/ */

        if (max < min)
        {
            throw {
                "name": "Invalid arguments",
                "message": `Bounded random number generation max is smaller than min (${max} < ${min})`
            };
        }

        if (n < 1)
        {
            throw {
                "name": "Invalid argument",
                "message": `'n' must be 1 or greater (received ${n})`
            };
        }

        if (min === max)
        {
            return min;
        }

        if (shift > (max - min))
        {
            /* If a rolled number is out of bounds (due to bias being applied), we simply roll it again.
             * As the shifting increases, the chance of rolling a number within bounds decreases.
             * A shift that is equal to the available range only has a 50% chance of rolling correctly, theoretically halving performance.
             * Shifting even further drops the success chance very rapidly - so we want to warn against that */

            logger.logWarning("Bias shift for random number generation is greater than the range of available numbers.\nThis can have a very severe performance impact!");
            logger.logInfo(`min -> ${min}; max -> ${max}; shift -> ${shift}`);
        }

        const gaussianRandom = (n) =>
        {
            let rand = 0;

            for (let i = 0; i < n; i += 1)
            {
                rand += Math.random();
            }

            return (rand / n);
        };

        const boundedGaussian = (start, end, n) =>
        {
            return Math.round(start + gaussianRandom(n) * (end - start + 1));
        };

        const biasedMin = shift >= 0 ? min - shift : min;
        const biasedMax = shift < 0 ? max + shift : max;

        let num;
        do
        {
            num = boundedGaussian(biasedMin, biasedMax, n);
        }
        while (num < min || num > max);

        return num;
    }

    /** Compares two item templates by their price to spawn chance ratio */
    compareByValue(a, b)
    {
        // If an item has no price or spawn chance, it should be moved to the back when sorting
        if (!a._props.CreditsPrice || !a._props.SpawnChance)
        {
            return 1;
        }

        if (!b._props.CreditsPrice || !b._props.SpawnChance)
        {
            return -1;
        }

        const worthA = a._props.CreditsPrice / a._props.SpawnChance;
        const worthB = b._props.CreditsPrice / b._props.SpawnChance;

        if (worthA < worthB)
        {
            return -1;
        }

        if (worthA > worthB)
        {
            return 1;
        }

        return 0;
    }

    /** Ensure magazines attached to a weapon are filled with compatible ammo (or updated). */
    fillExistingMagazines(weaponMods, magazineMod, ammoTpl)
    {
        try
        {
            if (!magazineMod || !magazineMod._id || !magazineMod._tpl) return;

            const magTpl = magazineMod._tpl;
            const magTemplate = global._database.items[magTpl];
            if (!magTemplate || !magTemplate._props || !magTemplate._props.Cartridges || !magTemplate._props.Cartridges.length) return;

            const cartridgeDef = magTemplate._props.Cartridges[0];
            const capacity = cartridgeDef._max_count || (cartridgeDef._props && cartridgeDef._props._max_count) || 1;

            // Determine allowed ammo for this magazine (if filter exists)
            let ammoToUse = ammoTpl;
            if (cartridgeDef._props && cartridgeDef._props.filters && cartridgeDef._props.filters[0] && cartridgeDef._props.filters[0].Filter)
            {
                const allowed = cartridgeDef._props.filters[0].Filter;
                if (!allowed.includes(ammoTpl))
                {
                    // Fallback to first allowed ammo in mag filter if preferred ammo incompatible
                    ammoToUse = allowed.length ? allowed[0] : ammoTpl;
                }
            }

            // Check for existing cartridges already attached to this magazine and update if necessary
            const existing = weaponMods.find(m => m.parentId === magazineMod._id && m.slotId === "cartridges");
            if (existing)
            {
                existing._tpl = ammoToUse;
                existing.upd = existing.upd || {};
                existing.upd.StackObjectsCount = capacity;
            }
            else
            {
                const ammoItem = {
                    "_id": utility.generateNewItemId(),
                    "_tpl": ammoToUse,
                    "parentId": magazineMod._id,
                    "slotId": "cartridges",
                    "upd": { "StackObjectsCount": capacity }
                };
                weaponMods.push(ammoItem);
            }
        }
        catch (e)
        {
            logger.logError(`fillExistingMagazines error: ${e.message}`);
        }
    }
}

// randomize armor durability for PMC armors
try {
    const cfg = (global && global._database && global._database.gameplayConfig && global._database.gameplayConfig.bots && global._database.gameplayConfig.bots.randomizeArmorDurability) || {};
    const chance = Number.isFinite(cfg.chance) ? cfg.chance : ArmorDurabilityRandomizerConfig.chance;
    const rangePercent = Number.isFinite(cfg.rangePercent) ? cfg.rangePercent : ArmorDurabilityRandomizerConfig.rangePercent;

    if ((bot.Info.Side === "Usec" || bot.Info.Side === "Bear") && utility.getRandomIntEx(100) <= chance) {
        for (const item of bot.Inventory.items) {
            const tpl = global._database.items[item._tpl];
            if (!tpl || !tpl._props || typeof tpl._props.MaxDurability !== "number") continue;

            const tplMax = tpl._props.MaxDurability;
            const pct = Math.max(0, Math.min(100, rangePercent));
            const minVal = Math.max(1, Math.floor(tplMax * (100 - pct) / 100));
            const newDur = utility.getRandomInt(minVal, tplMax);

            item.upd = item.upd || {};
            item.upd.Repairable = item.upd.Repairable || {};
            // set current and instance max to same randomized value (never exceed template max)
            item.upd.Repairable.Durability = Math.min(newDur, tplMax);
            item.upd.Repairable.MaxDurability = Math.min(newDur, tplMax);
        }
    }
}
catch (e) {
    logger.logError && logger.logError(`armor durability randomize error: ${e.message}`);
}

class ExhaustableArray
{
    constructor(itemPool)
    {
        this.pool = utility.wipeDepend(itemPool);
    }

    getRandomValue()
    {
        if (!this.pool || !this.pool.length)
        {
            return null;
        }

        const index = utility.getRandomInt(0, this.pool.length - 1);
        const toReturn = utility.wipeDepend(this.pool[index]);
        this.pool.splice(index, 1);
        return toReturn;
    }

    hasValues()
    {
        if (this.pool && this.pool.length)
        {
            return true;
        }

        return false;
    }
}

var controller = new Controller();
module.exports.botHandler = controller;
module.exports.generate = controller.generate;
module.exports.getBotLimit = controller.getBotLimit;
module.exports.getBotDifficulty = controller.getBotDifficulty;
module.exports.generatePlayerScav = controller.generatePlayerScav;

module.exports.generator = new Generator();
//module.exports.Controller = Controller;

