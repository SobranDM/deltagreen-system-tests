import {
  deleteTestActor,
  lastChatMessageMatching,
  settleAgentSideEffects,
  useQuenchTimeout,
  waitForActorBootstrap,
  waitForChatMessage,
  withSanityRollSource,
  withSetting
} from '../helpers.js'

async function prepareAgentForSanity (label, { sanity = 50, currentBreakingPoint = 30 } = {}) {
  const actor = await Actor.create({
    name: 'Quench ' + label + ' ' + foundry.utils.randomID(),
    type: 'agent',
    system: {
      sanity: {
        value: sanity,
        currentBreakingPoint: currentBreakingPoint,
        adaptations: {
          violence: { incident1: false, incident2: false, incident3: false },
          helplessness: { incident1: false, incident2: false, incident3: false }
        }
      }
    }
  })
  await waitForActorBootstrap(actor)
  return game.actors.get(actor.id) ?? actor
}

function messageCount () {
  return game.messages.size
}

/** Nested tick/clear updates can lag on actor.system until reset. */
async function syncActor (actor) {
  await settleAgentSideEffects(actor)
  actor.reset()
}

function violenceIncidents (actor) {
  const v = actor.system.sanity.adaptations.violence
  return [v.incident1, v.incident2, v.incident3]
}

function helplessnessIncidents (actor) {
  const h = actor.system.sanity.adaptations.helplessness
  return [h.incident1, h.incident2, h.incident3]
}

/** Same update shape as DGAgentSheet._resetBreakingPoint */
async function applyBreakingPointReset (actor) {
  const pow =
    actor.system.statistics.pow.effectiveValue ??
    actor.system.statistics.pow.value
  const currentBreakingPoint = Math.max(actor.system.sanity.value - pow, 0)
  const dataToUpdate = {
    'system.sanity.currentBreakingPoint': currentBreakingPoint
  }
  if (!actor.system.sanity.adaptations.violence.isAdapted) {
    dataToUpdate['system.sanity.adaptations.violence.incident1'] = false
    dataToUpdate['system.sanity.adaptations.violence.incident2'] = false
    dataToUpdate['system.sanity.adaptations.violence.incident3'] = false
  }
  if (!actor.system.sanity.adaptations.helplessness.isAdapted) {
    dataToUpdate['system.sanity.adaptations.helplessness.incident1'] = false
    dataToUpdate['system.sanity.adaptations.helplessness.incident2'] = false
    dataToUpdate['system.sanity.adaptations.helplessness.incident3'] = false
  }
  await actor.update(dataToUpdate)
}

export default function register (quench) {
  quench.registerBatch(
    'deltagreen.sanity.automation',
    (context) => {
      const { describe, it, assert } = context

      describe('SAN automation', function () {
        useQuenchTimeout(this)

        it('small loss with violence source ticks next incident', async function () {
          const actor = await prepareAgentForSanity('san-tick-violence')
          try {
            await withSanityRollSource(actor, 'violence', async () => {
              await actor.update({ 'system.sanity.value': 47 })
            })
            await syncActor(actor)
            assert.deepEqual(violenceIncidents(actor), [true, false, false])
          } finally {
            await deleteTestActor(actor)
          }
        })

        it('small loss with helplessness source ticks helplessness incident', async function () {
          const actor = await prepareAgentForSanity('san-tick-helpless')
          try {
            await withSanityRollSource(actor, 'helplessness', async () => {
              await actor.update({ 'system.sanity.value': 48 })
            })
            await syncActor(actor)
            assert.deepEqual(helplessnessIncidents(actor), [true, false, false])
          } finally {
            await deleteTestActor(actor)
          }
        })

        it('small loss with unnatural source does not tick incidents', async function () {
          const actor = await prepareAgentForSanity('san-no-tick')
          try {
            await withSanityRollSource(actor, 'unnatural', async () => {
              await actor.update({ 'system.sanity.value': 49 })
            })
            await syncActor(actor)
            assert.deepEqual(violenceIncidents(actor), [false, false, false])
            assert.deepEqual(helplessnessIncidents(actor), [false, false, false])
          } finally {
            await deleteTestActor(actor)
          }
        })

        it('4-point loss ticks instead of clearing partial incidents', async function () {
          const actor = await prepareAgentForSanity('san-tick-not-clear')
          try {
            await actor.update({
              'system.sanity.adaptations.violence.incident1': true,
              'system.sanity.adaptations.violence.incident2': true
            })
            await withSanityRollSource(actor, 'violence', async () => {
              await actor.update({ 'system.sanity.value': 46 })
            })
            await syncActor(actor)
            assert.deepEqual(violenceIncidents(actor), [true, true, true])
            assert.isTrue(actor.system.sanity.adaptations.violence.isAdapted)
          } finally {
            await deleteTestActor(actor)
          }
        })

        it('5+ SAN loss clears all partial violence incidents and posts temp insanity chat', async function () {
          const actor = await prepareAgentForSanity('san-temp')
          try {
            await actor.update({
              'system.sanity.adaptations.violence.incident1': true,
              'system.sanity.adaptations.violence.incident2': true,
              'system.sanity.adaptations.helplessness.incident1': true
            })
            const before = messageCount()
            await withSanityRollSource(actor, 'violence', async () => {
              await actor.update({ 'system.sanity.value': 44 })
            })
            await waitForChatMessage(actor.name, { beforeCount: before })
            await syncActor(actor)
            assert.isAbove(messageCount(), before)
            assert.isTrue(
              lastChatMessageMatching(actor.name)?.getFlag('deltagreen', 'chatCard'),
            )
            assert.deepEqual(violenceIncidents(actor), [false, false, false])
            assert.deepEqual(helplessnessIncidents(actor), [true, false, false])
          } finally {
            await deleteTestActor(actor)
          }
        })

        it('exactly 5-point loss clears correlated violence incidents', async function () {
          const actor = await prepareAgentForSanity('san-temp-exact-5')
          try {
            await actor.update({
              'system.sanity.adaptations.violence.incident1': true,
              'system.sanity.adaptations.violence.incident2': true
            })
            await withSanityRollSource(actor, 'violence', async () => {
              await actor.update({ 'system.sanity.value': 45 })
            })
            await syncActor(actor)
            assert.deepEqual(violenceIncidents(actor), [false, false, false])
          } finally {
            await deleteTestActor(actor)
          }
        })

        it('5+ SAN loss without roll source leaves incidents unchanged', async function () {
          const actor = await prepareAgentForSanity('san-temp-no-source')
          try {
            await actor.update({
              'system.sanity.adaptations.violence.incident1': true,
              'system.sanity.adaptations.violence.incident2': true
            })
            const before = messageCount()
            await withSanityRollSource(actor, 'none', async () => {
              await actor.update({ 'system.sanity.value': 44 })
            })
            await waitForChatMessage(actor.name, { beforeCount: before })
            await syncActor(actor)
            assert.deepEqual(violenceIncidents(actor), [true, true, false])
          } finally {
            await deleteTestActor(actor)
          }
        })

        it('5+ SAN loss does not clear an already adapted track', async function () {
          const actor = await prepareAgentForSanity('san-temp-adapted')
          try {
            await actor.update({
              'system.sanity.adaptations.violence.incident1': true,
              'system.sanity.adaptations.violence.incident2': true,
              'system.sanity.adaptations.violence.incident3': true
            })
            assert.isTrue(actor.system.sanity.adaptations.violence.isAdapted)
            await withSanityRollSource(actor, 'violence', async () => {
              await actor.update({ 'system.sanity.value': 44 })
            })
            await syncActor(actor)
            assert.deepEqual(violenceIncidents(actor), [true, true, true])
            assert.isTrue(actor.system.sanity.adaptations.violence.isAdapted)
          } finally {
            await deleteTestActor(actor)
          }
        })

        it('dropping to breaking point clears both adaptation tracks', async function () {
          const actor = await prepareAgentForSanity('san-bp', {
            sanity: 36,
            currentBreakingPoint: 35
          })
          try {
            await actor.update({
              'system.sanity.adaptations.violence.incident1': true,
              'system.sanity.adaptations.violence.incident2': true,
              'system.sanity.adaptations.helplessness.incident1': true
            })
            const before = messageCount()
            await withSanityRollSource(actor, 'violence', async () => {
              await actor.update({ 'system.sanity.value': 34 })
            })
            await waitForChatMessage('breaking point', { beforeCount: before })
            await syncActor(actor)
            assert.equal(messageCount(), before + 1)
            assert.deepEqual(violenceIncidents(actor), [false, false, false])
            assert.deepEqual(helplessnessIncidents(actor), [false, false, false])
            assert.isTrue(actor.system.sanity.breakingPointHit)
          } finally {
            await deleteTestActor(actor)
          }
        })

        it('5+ SAN loss crossing breaking point clears both tracks in one update', async function () {
          const actor = await prepareAgentForSanity('san-temp-and-bp', {
            sanity: 40,
            currentBreakingPoint: 35
          })
          try {
            await actor.update({
              'system.sanity.adaptations.violence.incident1': true,
              'system.sanity.adaptations.violence.incident2': true,
              'system.sanity.adaptations.helplessness.incident1': true,
              'system.sanity.adaptations.helplessness.incident2': true
            })
            const before = messageCount()
            await withSanityRollSource(actor, 'violence', async () => {
              await actor.update({ 'system.sanity.value': 34 })
            })
            await waitForChatMessage('temporarily insane', { beforeCount: before })
            await syncActor(actor)
            assert.equal(messageCount(), before + 1)
            const msg = lastChatMessageMatching('temporarily insane')
            assert.isTrue(msg?.getFlag('deltagreen', 'chatCard'))
            assert.include(msg.content, 'breaking point')
            assert.deepEqual(violenceIncidents(actor), [false, false, false])
            assert.deepEqual(helplessnessIncidents(actor), [false, false, false])
            assert.isTrue(actor.system.sanity.breakingPointHit)
          } finally {
            await deleteTestActor(actor)
          }
        })

        it('completing adaptation posts adaptation chat', async function () {
          const actor = await prepareAgentForSanity('san-adapted')
          try {
            const before = messageCount()
            await actor.update({
              'system.sanity.adaptations.violence.incident1': true,
              'system.sanity.adaptations.violence.incident2': true,
              'system.sanity.adaptations.violence.incident3': true
            })
            await waitForChatMessage('Adapted to Violence', { beforeCount: before })
            await syncActor(actor)
            assert.isAbove(messageCount(), before)
            assert.isTrue(actor.system.sanity.adaptations.violence.isAdapted)
          } finally {
            await deleteTestActor(actor)
          }
        })

        it('automation disabled skips incident ticks', async function () {
          const actor = await prepareAgentForSanity('san-off')
          try {
            await withSetting('automateAdaptationTicks', false, async () => {
              await withSanityRollSource(actor, 'violence', async () => {
                await actor.update({ 'system.sanity.value': 47 })
              })
            })
            await syncActor(actor)
            assert.deepEqual(violenceIncidents(actor), [false, false, false])
          } finally {
            await deleteTestActor(actor)
          }
        })

        it('breaking point reset clears non-adapted incidents', async function () {
          const actor = await prepareAgentForSanity('san-reset-bp')
          try {
            await actor.update({
              'system.sanity.value': 40,
              'system.sanity.adaptations.violence.incident1': true,
              'system.sanity.adaptations.violence.incident2': true,
              'system.sanity.adaptations.helplessness.incident1': true
            })
            await applyBreakingPointReset(actor)
            await syncActor(actor)
            assert.deepEqual(violenceIncidents(actor), [false, false, false])
            assert.deepEqual(helplessnessIncidents(actor), [false, false, false])
          } finally {
            await deleteTestActor(actor)
          }
        })

        it('incident-only updates do not re-trigger sanity loss chat', async function () {
          const actor = await prepareAgentForSanity('san-nested')
          try {
            const before = messageCount()
            await withSanityRollSource(actor, 'violence', async () => {
              await actor.update({ 'system.sanity.value': 44 })
            })
            await waitForChatMessage(actor.name, { beforeCount: before })
            const afterLoss = messageCount()
            await actor.update({
              'system.sanity.adaptations.violence.incident1': true
            })
            await syncActor(actor)
            assert.equal(messageCount(), afterLoss)
          } finally {
            await deleteTestActor(actor)
          }
        })
      })
    },
    { displayName: 'SAN: automation', preSelected: true }
  )
}
