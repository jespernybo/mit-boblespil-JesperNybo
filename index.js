const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const players = {};
const alliances = {}; 
let foods = []; 
let bots = {}; 
let viruses = []; 
let ejectedMass = []; 
let feeders = []; 
let feederSpawnTimer = 0; 
const MAX_FEEDERS = 1; 

const WORLD_SIZE = 10000; 

const BOT_NAMES = ["Apollo", "Zeus", "Athena", "Ares", "Thor", "Odin", "Loki", "Freya", "Hades", "Anubis", "Dumle", "Tulle"];
const ELITE_NAMES = ["🔴 Killer Boy", "🔴 Killer Girl", "🔴 Bloodhunter", "🔴 Soul Eater", "🔴 Skullcrusher", "🔴 Nightmare", "🔴 Doom", "🔴 Widowmaker"];

for(let i = 0; i < 800; i++) {
    foods.push({ id: Math.random(), x: Math.random() * WORLD_SIZE, y: Math.random() * WORLD_SIZE, hue: Math.floor(Math.random() * 360), radius: 6 });
}

function spawnBot(id) {
    let eliteGroups = new Set();
    for (let k in bots) {
        if (bots[k].behavior === 'elite') eliteGroups.add(bots[k].groupId);
    }
    let eliteCount = eliteGroups.size;
    
    let bType = 'normal';
    let bName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    let startRadius = 25 + Math.random() * 30; 
    
    if (eliteCount < 2) {
        bType = 'elite';
        startRadius = 80 + Math.random() * 40; 
        
        let usedNames = [];
        for (let k in bots) {
            if (bots[k].behavior === 'elite') usedNames.push(bots[k].name);
        }
        let availableNames = ELITE_NAMES.filter(name => !usedNames.includes(name));
        if (availableNames.length === 0) availableNames = ELITE_NAMES; 
        bName = availableNames[Math.floor(Math.random() * availableNames.length)];
    } else {
        bType = Math.random() < 0.3 ? 'dumb' : 'normal';
    }

    return { 
        id: id, groupId: id, x: Math.random() * WORLD_SIZE, y: Math.random() * WORLD_SIZE, 
        radius: startRadius, hue: Math.floor(Math.random() * 360), 
        name: bName, targetX: Math.random() * WORLD_SIZE, targetY: Math.random() * WORLD_SIZE, 
        vx: 0, vy: 0, isSprinting: false, sprintBurst: 0, behavior: bType, mergeCooldown: 0 
    };
}

for(let i = 0; i < 15; i++) {
    let id = 'bot_' + Math.random().toString(36).substr(2, 5);
    bots[id] = spawnBot(id);
}

for(let i = 0; i < 4; i++) {
    viruses.push({ id: Math.random(), x: Math.random() * WORLD_SIZE, y: Math.random() * WORLD_SIZE, radius: 65, eaten: 0, vx: 0, vy: 0, lifeTimer: 60 });
}

function spawnFeeder() {
    feeders.push({ id: Math.random(), x: Math.random() * WORLD_SIZE, y: Math.random() * WORLD_SIZE, radius: 80, foodToDrop: 300, dropTimer: 0 });
    io.emit('feederSpawned'); 
}
for (let i = 0; i < MAX_FEEDERS; i++) spawnFeeder();

setInterval(() => {
    let deltaTime = 1 / 30; 

    if (ejectedMass.length > 150) {
        ejectedMass.splice(0, ejectedMass.length - 150);
    }

    if (feeders.length < MAX_FEEDERS) {
        feederSpawnTimer -= deltaTime;
        if (feederSpawnTimer <= 0) spawnFeeder();
    }

    for (let i = feeders.length - 1; i >= 0; i--) {
        let f = feeders[i];
        f.dropTimer -= deltaTime;
        if (f.dropTimer <= 0 && f.foodToDrop > 0) {
            let dropAmount = Math.min(3, f.foodToDrop);
            for (let j = 0; j < dropAmount; j++) {
                let angle = Math.random() * Math.PI * 2;
                let speed = 10 + Math.random() * 20;
                ejectedMass.push({ id: Math.random(), x: f.x + Math.cos(angle) * (f.radius - 10), y: f.y + Math.sin(angle) * (f.radius - 10), radius: 14, hue: 50, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, sender: 'star', massMultiplier: 0.75 });
            }
            f.foodToDrop -= dropAmount; f.dropTimer = 0.4;
        }
        if (f.foodToDrop <= 0) { feeders.splice(i, 1); feederSpawnTimer = 15 + Math.random() * 35; }
    }

    for (let i = viruses.length - 1; i >= 0; i--) {
        let v = viruses[i];
        v.lifeTimer -= deltaTime;
        if (v.lifeTimer <= 0) {
            viruses.splice(i, 1);
            viruses.push({ id: Math.random(), x: Math.random() * WORLD_SIZE, y: Math.random() * WORLD_SIZE, radius: 65, eaten: 0, vx: 0, vy: 0, lifeTimer: 60 });
            continue; 
        }

        if (Math.abs(v.vx) > 0.1 || Math.abs(v.vy) > 0.1) {
            v.x += v.vx; v.y += v.vy; v.vx *= 0.92; v.vy *= 0.92;
            v.x = Math.max(v.radius, Math.min(WORLD_SIZE - v.radius, v.x)); v.y = Math.max(v.radius, Math.min(WORLD_SIZE - v.radius, v.y));
        } else { v.vx = 0; v.vy = 0; }
    }

    for (let i = ejectedMass.length - 1; i >= 0; i--) {
        let em = ejectedMass[i];
        em.x += em.vx; em.y += em.vy; em.vx *= 0.9; em.vy *= 0.9;
        em.x = Math.max(em.radius, Math.min(WORLD_SIZE - em.radius, em.x)); 
        em.y = Math.max(em.radius, Math.min(WORLD_SIZE - em.radius, em.y));

        let emEaten = false;

        for (let v = 0; v < viruses.length; v++) {
            let virus = viruses[v];
            if (Math.hypot(virus.x - em.x, virus.y - em.y) < virus.radius) {
                if (em.isSprintDrop) {
                    virus.radius += 0.5;
                } else {
                    virus.eaten = (virus.eaten || 0) + 1; virus.radius += 3; 
                    virus.lifeTimer = 60; 
                    if (virus.eaten >= 5) {
                        virus.eaten = 0; virus.radius = 65; 
                        let speed = Math.hypot(em.vx, em.vy) || 1;
                        if (viruses.length < 15) { 
                            viruses.push({ id: Math.random(), x: virus.x, y: virus.y, vx: (em.vx / speed) * 35, vy: (em.vy / speed) * 35, radius: 65, eaten: 0, lifeTimer: 60 });
                        }
                    }
                }
                io.emit('ejectedMassEaten', em.id); ejectedMass.splice(i, 1); emEaten = true;
                break;
            }
        }
        
        if (emEaten) continue; 

        for (let id in bots) {
            let bot = bots[id];
            if (Math.hypot(bot.x - em.x, bot.y - em.y) < bot.radius) {
                let eliteBonus = bot.behavior === 'elite' ? 1.5 : 1.0;
                if (em.isSprintDrop) {
                    bot.radius = Math.sqrt(bot.radius**2 + ((6**2) * 0.060 * 2 * eliteBonus)); 
                } else {
                    bot.radius = Math.sqrt(bot.radius**2 + (em.radius**2 * (em.massMultiplier || 1) * 0.35 * eliteBonus)); 
                }
                io.emit('ejectedMassEaten', em.id); ejectedMass.splice(i, 1);
                break;
            }
        }
    }

    let groupLeaders = {};
    for (let id in bots) {
        let b = bots[id];
        if (!groupLeaders[b.groupId] || b.radius > groupLeaders[b.groupId].radius) {
            groupLeaders[b.groupId] = b;
        }
    }

    for (let id in bots) {
        let bot = bots[id];
        if (!bot) continue;

        let eliteBonus = bot.behavior === 'elite' ? 1.5 : 1.0;
        if (bot.mergeCooldown > 0) bot.mergeCooldown -= deltaTime;
        
        let leader = groupLeaders[bot.groupId];

        if (bot.id === leader.id) {
            let visionRadius = 700 + (bot.radius * 2); 
            
            let closestThreat = null; let closestThreatDist = Infinity;
            let closestPrey = null;   let closestPreyDist = Infinity;
            let bestPreyScore = -Infinity; 

            for (let pId in players) {
                let p = players[pId];
                if (p.isInvincible || p.godMode) continue; 
                if (p.cells) {
                    for (let cell of p.cells) {
                        let dist = Math.hypot(cell.x - bot.x, cell.y - bot.y);
                        if (dist < visionRadius) {
                            if (cell.radius > bot.radius * 1.15 && dist < closestThreatDist) {
                                closestThreat = cell; closestThreatDist = dist;
                            } else if (bot.radius > cell.radius * 1.15) {
                                let score = cell.radius / (dist || 1);
                                if (score > bestPreyScore) {
                                    bestPreyScore = score; closestPrey = cell; closestPreyDist = dist;
                                }
                            }
                        }
                    }
                }
            }

            for (let otherId in bots) {
                if (id === otherId) continue;
                let otherBot = bots[otherId];
                if (bot.groupId === otherBot.groupId) continue;

                let dist = Math.hypot(otherBot.x - bot.x, otherBot.y - bot.y);
                if (dist < visionRadius) {
                    if (otherBot.radius > bot.radius * 1.15 && dist < closestThreatDist) {
                        closestThreat = otherBot; closestThreatDist = dist;
                    } else if (bot.radius > otherBot.radius * 1.15) {
                        let score = otherBot.radius / (dist || 1);
                        if (score > bestPreyScore) {
                            bestPreyScore = score; closestPrey = otherBot; closestPreyDist = dist;
                        }
                    }
                }
            }

            for (let v of viruses) {
                let dist = Math.hypot(v.x - bot.x, v.y - bot.y);
                if (dist < visionRadius && bot.radius > v.radius * 1.15) {
                    if (dist < closestThreatDist) {
                        closestThreat = v; closestThreatDist = dist; 
                    }
                }
            }

            let bestFood = null; let bestFoodScore = -Infinity;
            for (let em of ejectedMass) {
                let dist = Math.hypot(em.x - bot.x, em.y - bot.y);
                if (dist < visionRadius) {
                    let score = (em.isSprintDrop ? 100 : 50) - dist * 0.05; 
                    if (score > bestFoodScore) { bestFoodScore = score; bestFood = em; }
                }
            }
            if (!bestFood) {
                for (let f of foods) {
                    let dist = Math.hypot(f.x - bot.x, f.y - bot.y);
                    if (dist < visionRadius) {
                        let score = 10 - dist * 0.05;
                        if (score > bestFoodScore) { bestFoodScore = score; bestFood = f; }
                    }
                }
            }

            bot.isSprinting = false;
            
            let myGroupCount = 0;
            for (let k in bots) if (bots[k].groupId === bot.groupId) myGroupCount++;

            if (bot.behavior === 'dumb') {
                if (closestThreat) {
                    let escX = bot.x - closestThreat.x; let escY = bot.y - closestThreat.y;
                    if (escX === 0 && escY === 0) { escX = 10; escY = 10; } 
                    bot.targetX = bot.x + escX; bot.targetY = bot.y + escY; 
                } else if (bestFood) {
                    bot.targetX = bestFood.x; bot.targetY = bestFood.y;
                } else {
                    let dx = bot.targetX - bot.x; let dy = bot.targetY - bot.y;
                    if (Math.hypot(dx, dy) < 50) {
                        bot.targetX = bot.x + (Math.random() - 0.5) * 1000; bot.targetY = bot.y + (Math.random() - 0.5) * 1000;
                    }
                }
            } 
            else if (bot.behavior === 'elite') {
                if (closestThreat && closestThreatDist < visionRadius * 0.9) {
                    let escX = bot.x - closestThreat.x; let escY = bot.y - closestThreat.y;
                    if (escX === 0 && escY === 0) { escX = 10; escY = 10; }
                    bot.targetX = bot.x + escX;
                    bot.targetY = bot.y + escY;
                    if (bot.sprintBurst <= 0 && closestThreatDist < bot.radius * 4 && bot.radius > 35 && Math.random() < 0.10) {
                        bot.sprintBurst = 20; 
                    }
                } else if (closestPrey) {
                    bot.targetX = closestPrey.x;
                    bot.targetY = closestPrey.y;
                    
                    if (myGroupCount < 4 && bot.radius > closestPrey.radius * 2.2 && bot.radius > 80 && bot.mergeCooldown <= 0 && closestPreyDist > bot.radius && closestPreyDist < visionRadius * 0.8) {
                        let newRadius = Math.sqrt((bot.radius * bot.radius) / 2);
                        bot.radius = newRadius;
                        bot.mergeCooldown = 10 + (newRadius * 0.05); 
                        
                        let dirX = (closestPrey.x - bot.x) / closestPreyDist;
                        let dirY = (closestPrey.y - bot.y) / closestPreyDist;
                        
                        let newBotId = 'bot_split_' + Math.random().toString(36).substr(2, 5);
                        bots[newBotId] = {
                            id: newBotId, groupId: bot.groupId, x: bot.x + dirX * (newRadius + 15), y: bot.y + dirY * (newRadius + 15),
                            radius: newRadius, hue: bot.hue, name: bot.name, targetX: closestPrey.x, targetY: closestPrey.y,
                            vx: dirX * 25, vy: dirY * 25, isSprinting: false, sprintBurst: 0, behavior: 'elite', mergeCooldown: 10 + (newRadius * 0.05)
                        };
                    } 
                    else if (bot.sprintBurst <= 0 && closestPreyDist < bot.radius * 3.5 && bot.radius > 45 && Math.random() < 0.03) {
                        bot.sprintBurst = 15; 
                    }
                } else if (bestFood) {
                    bot.targetX = bestFood.x; bot.targetY = bestFood.y;
                } else {
                    let dx = bot.targetX - bot.x; let dy = bot.targetY - bot.y;
                    if (Math.hypot(dx, dy) < 50) {
                        bot.targetX = bot.x + (Math.random() - 0.5) * 2000; bot.targetY = bot.y + (Math.random() - 0.5) * 2000;
                    }
                }
            } 
            else {
                if (closestThreat && closestThreatDist < visionRadius * 0.8) {
                    let escX = bot.x - closestThreat.x; let escY = bot.y - closestThreat.y;
                    if (escX === 0 && escY === 0) { escX = 10; escY = 10; }
                    bot.targetX = bot.x + escX;
                    bot.targetY = bot.y + escY;
                    if (bot.sprintBurst <= 0 && closestThreatDist < bot.radius * 3 && bot.radius > 35 && Math.random() < 0.05) {
                        bot.sprintBurst = 15;
                    }
                } else if (closestPrey) {
                    bot.targetX = closestPrey.x;
                    bot.targetY = closestPrey.y;
                    if (myGroupCount < 4 && bot.radius > closestPrey.radius * 2.0 && bot.radius > 60 && bot.mergeCooldown <= 0 && closestPreyDist > bot.radius && closestPreyDist < visionRadius * 0.7) {
                        let newRadius = Math.sqrt((bot.radius * bot.radius) / 2);
                        bot.radius = newRadius;
                        bot.mergeCooldown = 10 + (newRadius * 0.05); 
                        
                        let dirX = (closestPrey.x - bot.x) / closestPreyDist; let dirY = (closestPrey.y - bot.y) / closestPreyDist;
                        let newBotId = 'bot_split_' + Math.random().toString(36).substr(2, 5);
                        bots[newBotId] = {
                            id: newBotId, groupId: bot.groupId, x: bot.x + dirX * (newRadius + 15), y: bot.y + dirY * (newRadius + 15),
                            radius: newRadius, hue: bot.hue, name: bot.name, targetX: closestPrey.x, targetY: closestPrey.y,
                            vx: dirX * 22, vy: dirY * 22, isSprinting: false, sprintBurst: 0, behavior: 'normal', mergeCooldown: 10 + (newRadius * 0.05)
                        };
                    } 
                    else if (bot.sprintBurst <= 0 && closestPreyDist < bot.radius * 3 && bot.radius > 45 && Math.random() < 0.02) {
                        bot.sprintBurst = 15; 
                    }
                } else if (bestFood) {
                    bot.targetX = bestFood.x; bot.targetY = bestFood.y;
                } else {
                    let dx = bot.targetX - bot.x; let dy = bot.targetY - bot.y;
                    if (Math.hypot(dx, dy) < 50) {
                        bot.targetX = bot.x + (Math.random() - 0.5) * 1000; bot.targetY = bot.y + (Math.random() - 0.5) * 1000;
                    }
                }
            }

            if (bot.sprintBurst > 0) {
                bot.isSprinting = true;
                bot.sprintBurst--;
            }
        } else {
            bot.targetX = leader.targetX;
            bot.targetY = leader.targetY;
            bot.isSprinting = leader.isSprinting;
        }

        let dx = bot.targetX - bot.x; let dy = bot.targetY - bot.y; let dist = Math.hypot(dx, dy) || 1;
        let botSpeedMultiplier = bot.behavior === 'elite' ? 0.85 : 0.55;
        let baseSpeed = Math.max(1.2, 35 / Math.sqrt(bot.radius)) * botSpeedMultiplier * (deltaTime * 60);

        if (bot.isSprinting && bot.radius > 25) {
            baseSpeed *= 1.5;
            bot.sprintDropTimer = (bot.sprintDropTimer || 0) + deltaTime;
            if (bot.sprintDropTimer > 0.15) {
                bot.sprintDropTimer = 0;
                let dropRadius = 8;
                let sprintCostMultiplier = bot.behavior === 'elite' ? 0.5 : 1.0;
                let massToLose = (dropRadius ** 2) * sprintCostMultiplier;
                
                if (Math.sqrt(bot.radius ** 2 - massToLose) > 25) {
                    bot.radius = Math.sqrt(bot.radius ** 2 - massToLose);
                    let backX = -(dx / dist); let backY = -(dy / dist); let spawnDist = bot.radius + dropRadius + 5;
                    
                    ejectedMass.push({
                        id: Math.random(), x: bot.x + backX * spawnDist, y: bot.y + backY * spawnDist,
                        vx: backX * 8, vy: backY * 8, radius: dropRadius, hue: bot.hue, isSprintDrop: true
                    });
                } else {
                    bot.isSprinting = false; bot.sprintBurst = 0;
                }
            }
        } else {
            bot.isSprinting = false;
        }

        bot.vx = (dx / dist) * baseSpeed; bot.vy = (dy / dist) * baseSpeed;
        bot.x += bot.vx; bot.y += bot.vy;
        bot.x = Math.max(bot.radius, Math.min(WORLD_SIZE - bot.radius, bot.x)); bot.y = Math.max(bot.radius, Math.min(WORLD_SIZE - bot.radius, bot.y));

        for (let i = foods.length - 1; i >= 0; i--) {
            if (Math.hypot(bot.x - foods[i].x, bot.y - foods[i].y) < bot.radius) {
                bot.radius = Math.sqrt(bot.radius**2 + (foods[i].radius**2 * 0.060 * eliteBonus)); 
                let eatenId = foods[i].id; 
                let newFood = { id: Math.random(), x: Math.random() * WORLD_SIZE, y: Math.random() * WORLD_SIZE, hue: Math.floor(Math.random() * 360), radius: 6 };
                foods[i] = newFood; 
                io.emit('foodUpdate', { eatenId: eatenId, newFood: newFood });
            }
        }

        for (let v = viruses.length - 1; v >= 0; v--) {
            let virus = viruses[v];
            let vDist = Math.hypot(bot.x - virus.x, bot.y - virus.y);
            
            if (bot.radius > virus.radius * 1.15 && vDist < bot.radius) {
                let currentGroupCount = 0;
                for (let k in bots) if (bots[k].groupId === bot.groupId) currentGroupCount++;
                
                let piecesToMake = Math.min(4, 6 - currentGroupCount); 
                if (piecesToMake > 1) {
                    let newRadius = Math.sqrt((bot.radius**2) / piecesToMake);
                    bot.radius = newRadius;
                    bot.mergeCooldown = 10 + (newRadius * 0.05);
                    
                    for (let p = 1; p < piecesToMake; p++) {
                        let angle = Math.random() * Math.PI * 2;
                        let speed = 20 + Math.random() * 10;
                        let newBotId = 'bot_pop_' + Math.random().toString(36).substr(2, 5);
                        bots[newBotId] = {
                            id: newBotId, groupId: bot.groupId, 
                            x: bot.x, y: bot.y, 
                            radius: newRadius, hue: bot.hue, name: bot.name, 
                            targetX: bot.targetX, targetY: bot.targetY, 
                            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, 
                            isSprinting: false, sprintBurst: 0, behavior: bot.behavior, mergeCooldown: 10 + (newRadius * 0.05)
                        };
                    }
                }
                
                io.emit('slimeSplat', { x: bot.x, y: bot.y, hue: bot.hue, radius: bot.radius });
                
                viruses.splice(v, 1);
                if (viruses.length < 4) {
                    viruses.push({ id: Math.random(), x: Math.random() * WORLD_SIZE, y: Math.random() * WORLD_SIZE, radius: 65, eaten: 0, vx: 0, vy: 0, lifeTimer: 60 });
                }
                break; 
            }
        }

        for (let pId in players) {
            let p = players[pId];
            if (p.isInvincible || p.godMode) continue; 
            if (p.cells) {
                for(let i = p.cells.length - 1; i >= 0; i--) {
                    let cell = p.cells[i];
                    if (bot.radius > cell.radius * 1.15 && Math.hypot(bot.x - cell.x, bot.y - cell.y) < bot.radius) {
                        bot.radius = Math.sqrt(bot.radius**2 + (cell.radius**2 * 0.90 * eliteBonus)); 
                        io.emit('slimeSplat', { x: cell.x, y: cell.y, hue: p.hue, radius: cell.radius });
                        
                        let deadCellId = cell.cellId; p.cells.splice(i, 1); io.emit('cellEaten', { victimId: pId, cellId: deadCellId });
                        if (p.cells.length === 0) { 
                            io.emit('killFeedMsg', { killer: bot.name, victim: p.name });
                            io.emit('playerDied', pId); 
                            delete players[pId]; 
                            break; 
                        }
                    }
                }
            }
        }
    }

    let botIds = Object.keys(bots);
    for (let i = 0; i < botIds.length; i++) {
        for (let j = i + 1; j < botIds.length; j++) {
            let b1 = bots[botIds[i]];
            let b2 = bots[botIds[j]];
            if (!b1 || !b2) continue;

            let dist = Math.hypot(b2.x - b1.x, b2.y - b1.y) || 1;
            
            if (b1.groupId === b2.groupId) {
                let overlap = (b1.radius + b2.radius) - dist;
                
                if (b1.mergeCooldown <= 0 && b2.mergeCooldown <= 0) {
                    if (overlap > -50) { 
                        let pull = 4; 
                        b1.x -= (b2.x - b1.x) / dist * -pull; b1.y -= (b2.y - b1.y) / dist * -pull; 
                        b2.x += (b2.x - b1.x) / dist * -pull; b2.y += (b2.y - b1.y) / dist * -pull; 
                    }
                    if (overlap > 10 || dist < Math.max(b1.radius, b2.radius) * 0.85) {
                        if (b1.radius >= b2.radius) {
                            b1.radius = Math.sqrt(b1.radius**2 + b2.radius**2); delete bots[b2.id];
                        } else {
                            b2.radius = Math.sqrt(b2.radius**2 + b1.radius**2); delete bots[b1.id];
                        }
                    }
                } else if (overlap > 0) { 
                    let push = overlap * 0.5; 
                    b1.x -= (b2.x - b1.x) / dist * push; b1.y -= (b2.y - b1.y) / dist * push; 
                    b2.x += (b2.x - b1.x) / dist * push; b2.y += (b2.y - b1.y) / dist * push; 
                } else if (dist > (b1.radius + b2.radius) + 15) {
                    let pull = 2; 
                    b1.x -= (b2.x - b1.x) / dist * -pull; b1.y -= (b2.y - b1.y) / dist * -pull; 
                    b2.x += (b2.x - b1.x) / dist * -pull; b2.y += (b2.y - b1.y) / dist * -pull; 
                }
            } else {
                if (b1.radius > b2.radius * 1.15 && dist < b1.radius) {
                    let eliteBonus = b1.behavior === 'elite' ? 1.5 : 1.0;
                    b1.radius = Math.sqrt(b1.radius**2 + (b2.radius**2 * 0.90 * eliteBonus)); 
                    io.emit('slimeSplat', { x: b2.x, y: b2.y, hue: b2.hue, radius: b2.radius });
                    io.emit('killFeedMsg', { killer: b1.name, victim: b2.name });
                    delete bots[b2.id];
                } else if (b2.radius > b1.radius * 1.15 && dist < b2.radius) {
                    let eliteBonus = b2.behavior === 'elite' ? 1.5 : 1.0;
                    b2.radius = Math.sqrt(b2.radius**2 + (b1.radius**2 * 0.90 * eliteBonus)); 
                    io.emit('slimeSplat', { x: b1.x, y: b1.y, hue: b1.hue, radius: b1.radius });
                    io.emit('killFeedMsg', { killer: b2.name, victim: b1.name });
                    delete bots[b1.id];
                }
            }
        }
    }
    
    let playerCount = Object.keys(players).length;
    let targetBotCount = Math.max(2, 15 - playerCount); 
    
    let botGroups = new Set();
    let normalBotGroups = new Set();
    for (let id in bots) {
        botGroups.add(bots[id].groupId);
        if (bots[id].behavior !== 'elite') {
            normalBotGroups.add(bots[id].groupId);
        }
    }
    
    if (botGroups.size < targetBotCount && Math.random() < 0.05) {
        let newId = 'bot_' + Math.random().toString(36).substr(2, 5);
        bots[newId] = spawnBot(newId);
    } 
    else if (botGroups.size > targetBotCount && normalBotGroups.size > 0 && Math.random() < 0.02) {
        let groupToRemove = Array.from(normalBotGroups)[0];
        for (let id in bots) {
            if (bots[id].groupId === groupToRemove) {
                delete bots[id]; 
            }
        }
    }
    
    io.emit('virusesUpdate', viruses); io.emit('botsUpdate', bots); io.emit('ejectedMassUpdate', ejectedMass); io.emit('feedersUpdate', feeders); 
}, 1000 / 30); 

io.on('connection', (socket) => {
  alliances[socket.id] = []; 

  socket.emit('currentPlayers', players); socket.emit('currentFood', foods); socket.emit('currentBots', bots); socket.emit('virusesUpdate', viruses); socket.emit('ejectedMassUpdate', ejectedMass); socket.emit('feedersUpdate', feeders); 

  socket.on('joinGame', (playerData) => {
      players[socket.id] = { cells: playerData.cells, hue: playerData.hue, name: playerData.name, skin: playerData.skin, level: playerData.level, isInvincible: true, godMode: false }; 
      socket.broadcast.emit('newPlayer', { id: socket.id, player: players[socket.id] });
  });

  socket.on('playerMovement', (movementData) => {
    if (players[socket.id]) {
      players[socket.id].cells = movementData.cells; 
      players[socket.id].isSprinting = movementData.isSprinting; 
      players[socket.id].level = movementData.level; 
      players[socket.id].isInvincible = movementData.isInvincible; 
      players[socket.id].godMode = movementData.godMode; 
      socket.broadcast.emit('playerMoved', { id: socket.id, cells: movementData.cells, isSprinting: movementData.isSprinting, level: movementData.level, isInvincible: movementData.isInvincible, godMode: movementData.godMode });
    }
  });

  socket.on('foodEaten', (foodId) => {
    const foodIndex = foods.findIndex(f => f.id === foodId);
    if (foodIndex !== -1) {
        const newFood = { id: Math.random(), x: Math.random() * WORLD_SIZE, y: Math.random() * WORLD_SIZE, hue: Math.floor(Math.random() * 360), radius: 6 };
        foods[foodIndex] = newFood; 
        io.emit('foodUpdate', { eatenId: foodId, newFood: newFood });
    }
  });

  socket.on('shootMass', (massData) => {
      const newMass = { id: massData.id || Math.random(), x: massData.x, y: massData.y, vx: massData.vx, vy: massData.vy, radius: massData.radius, hue: massData.hue, massMultiplier: massData.massMultiplier || 1, isSprintDrop: massData.isSprintDrop || false }; 
      ejectedMass.push(newMass);
  });

  socket.on('sprintDrop', (data) => {
      ejectedMass.push({ id: Math.random(), x: data.x, y: data.y, vx: 0, vy: 0, radius: 7, hue: data.hue, massMultiplier: 2, isSprintDrop: true });
  });

  socket.on('eatEjectedMass', (massId) => {
      const index = ejectedMass.findIndex(m => m.id === massId); if (index !== -1) { ejectedMass.splice(index, 1); io.emit('ejectedMassEaten', massId); }
  });

  socket.on('virusPopped', (virusId) => {
      const vIndex = viruses.findIndex(v => v.id === virusId);
      if (vIndex !== -1) {
          viruses.splice(vIndex, 1); if (viruses.length < 4) {
              viruses.push({ id: Math.random(), x: Math.random() * WORLD_SIZE, y: Math.random() * WORLD_SIZE, radius: 65, eaten: 0, vx: 0, vy: 0, lifeTimer: 60 });
          }
      }
  });

  socket.on('ateOtherPlayerCell', (data) => {
      const { victimId, cellId } = data;
      
      if (players[socket.id] && players[socket.id].isInvincible && !players[socket.id].godMode) return; 
      
      if (players[victimId] && players[victimId].isInvincible) return; 
      if (players[victimId] && players[victimId].godMode) return; 

      if (alliances[socket.id] && alliances[socket.id].includes(victimId)) return;

      if (players[socket.id] && players[victimId] && players[victimId].cells) {
          const cIndex = players[victimId].cells.findIndex(c => c.cellId === cellId);
          if (cIndex !== -1) {
              const cell = players[victimId].cells[cIndex];
              io.emit('slimeSplat', { x: cell.x, y: cell.y, hue: players[victimId].hue, radius: cell.radius });
              
              players[victimId].cells.splice(cIndex, 1); io.emit('cellEaten', { victimId: victimId, cellId: cellId });
              
              if (players[victimId].cells.length === 0) { 
                  io.emit('killFeedMsg', { killer: players[socket.id].name, victim: players[victimId].name });
                  io.emit('playerDied', victimId); 
                  delete players[victimId]; 
              }
          }
      }
  });

  socket.on('ateBot', (botId) => {
      if (players[socket.id] && players[socket.id].isInvincible && !players[socket.id].godMode) return; 
      if (players[socket.id] && bots[botId]) { 
          io.emit('slimeSplat', { x: bots[botId].x, y: bots[botId].y, hue: bots[botId].hue, radius: bots[botId].radius });
          
          io.emit('killFeedMsg', { killer: players[socket.id].name, victim: bots[botId].name });
          
          delete bots[botId]; 
      }
  });

  socket.on('suicide', () => {
      if (players[socket.id]) { io.emit('playerDied', socket.id); delete players[socket.id]; }
  });

  socket.on('sendMessage', (msgData) => {
      const text = String(msgData.text).substring(0, 100); 
      const name = String(msgData.name || "Gæst").substring(0, 15);
      io.emit('chatMessage', { name: name, text: text });
  });

  socket.on('requestAlliance', (targetId) => {
      if (players[socket.id] && players[targetId]) {
          io.to(targetId).emit('allianceRequested', { fromId: socket.id, fromName: players[socket.id].name });
      }
  });

  socket.on('acceptAlliance', (fromId) => {
      if (players[socket.id] && players[fromId]) {
          if(!alliances[socket.id].includes(fromId)) alliances[socket.id].push(fromId);
          if(!alliances[fromId].includes(socket.id)) alliances[fromId].push(socket.id);
          
          io.to(socket.id).emit('chatMessage', { name: "SYSTEM", text: "Du er nu i alliance med " + players[fromId].name });
          io.to(fromId).emit('chatMessage', { name: "SYSTEM", text: "Du er nu i alliance med " + players[socket.id].name });
          
          io.to(socket.id).emit('allianceFormed', fromId);
          io.to(fromId).emit('allianceFormed', socket.id);
      }
  });

  socket.on('breakAlliance', (targetId) => {
      if (alliances[socket.id]) alliances[socket.id] = alliances[socket.id].filter(id => id !== targetId);
      if (alliances[targetId]) alliances[targetId] = alliances[targetId].filter(id => id !== socket.id);
      
      io.to(targetId).emit('allianceBroken', socket.id);
      io.to(socket.id).emit('allianceBroken', targetId);
      
      if (players[socket.id] && players[targetId]) {
          io.to(targetId).emit('chatMessage', { name: "SYSTEM", text: players[socket.id].name + " har ophævet jeres alliance!" });
          io.to(socket.id).emit('chatMessage', { name: "SYSTEM", text: "Alliance med " + players[targetId].name + " ophævet." });
      }
  });

  socket.on('disconnect', () => { 
      if (alliances[socket.id]) {
          alliances[socket.id].forEach(allyId => {
              if (alliances[allyId]) {
                  alliances[allyId] = alliances[allyId].filter(id => id !== socket.id);
                  io.to(allyId).emit('allianceBroken', socket.id);
              }
          });
      }
      delete alliances[socket.id];
      delete players[socket.id]; 
      io.emit('playerDisconnected', socket.id); 
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server kører på port ${PORT}`);
});