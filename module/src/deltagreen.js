import registerActorsSmoke from './quench/batches/actors-smoke.js'
import registerItemsSmoke from './quench/batches/items-smoke.js'
import registerActorsDerived from './quench/batches/actors-derived.js'
import registerAgentBonds from './quench/batches/agent-bonds.js'
import registerAgentCombat from './quench/batches/agent-combat.js'
import registerRolls from './quench/batches/rolls.js'
import registerActiveEffects from './quench/batches/active-effects.js'
import registerPhysical from './quench/batches/physical.js'
import registerProse from './quench/batches/prose.js'
import registerChargen from './quench/batches/chargen.js'
import registerStatSetup from './quench/batches/stat-setup.js'
import registerChargenFlow from './quench/batches/chargen-flow.js'
import registerCompendiums from './quench/batches/compendiums.js'
import registerStimulantsTime from './quench/batches/stimulants-time.js'
import registerApi from './quench/batches/api.js'
import registerRegressions from './quench/batches/regressions.js'
import registerKnownBugs from './quench/batches/known-bugs.js'
import registerSheetsPersistence from './quench/batches/sheets-persistence.js'
import registerItemsFunctional from './quench/batches/items-functional.js'
import registerSanityAutomation from './quench/batches/sanity-automation.js'
import registerSanityGuards from './quench/batches/sanity-guards.js'
import registerInventory from './quench/batches/inventory.js'

const BATCH_REGISTRARS = [
  registerActorsSmoke,
  registerItemsSmoke,
  registerActorsDerived,
  registerAgentBonds,
  registerAgentCombat,
  registerRolls,
  registerActiveEffects,
  registerPhysical,
  registerProse,
  registerChargen,
  registerStatSetup,
  registerChargenFlow,
  registerCompendiums,
  registerStimulantsTime,
  registerApi,
  registerRegressions,
  registerKnownBugs,
  registerSheetsPersistence,
  registerItemsFunctional,
  registerSanityAutomation,
  registerSanityGuards,
  registerInventory
]

Hooks.on('quenchReady', (quench) => {
  for (const register of BATCH_REGISTRARS) {
    register(quench)
  }
})
