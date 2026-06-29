import {
  addCompendiumItemToActor,
  createActorEmbeddedEffect,
  createTestAgent,
  createTestItem,
  deleteTestActor,
  dgImport,
  packAvailable,
  useQuenchTimeout,
  waitForActorBootstrap,
  withSetting
} from '../helpers.js'

export default function register (quench) {
  quench.registerBatch(
    'deltagreen.inventory',
    (context) => {
      const { describe, it, assert } = context

      describe('Inventory UX logic', function () {
        useQuenchTimeout(this)

        it('resolveInventoryIconAction branches by item type and ritual learned state', async function () {
          const { resolveInventoryIconAction } = await dgImport(
            '/systems/deltagreen/module/item/inventory-actions.js'
          )

          const weapon = { type: 'weapon', system: {} }
          const armor = { type: 'armor', system: {} }
          const tome = { type: 'tome', system: {} }
          const ritualLearned = { type: 'ritual', system: { learned: true } }
          const ritualUnlearned = { type: 'ritual', system: { learned: false } }

          assert.equal(resolveInventoryIconAction(weapon), 'weapon-attack')
          assert.equal(resolveInventoryIconAction(armor), 'chat-card')
          assert.equal(resolveInventoryIconAction(tome), 'tome-choice')
          assert.equal(
            resolveInventoryIconAction(tome, { shiftKey: true }),
            'tome-study-san'
          )
          assert.equal(resolveInventoryIconAction(ritualLearned), 'ritual-choice')
          assert.equal(
            resolveInventoryIconAction(ritualLearned, { shiftKey: true }),
            'ritual-perform'
          )
          assert.equal(
            resolveInventoryIconAction(ritualUnlearned, { shiftKey: true }),
            'ritual-learn'
          )
        })

        it('buildInventorySummaryHeader excludes handler notes from player-visible header', async function () {
          const { buildInventorySummaryHeader } = await dgImport(
            '/systems/deltagreen/module/item/inventory-actions.js'
          )

          const weapon = {
            type: 'weapon',
            system: {
              damage: '1D8',
              armorPiercing: 2,
              skill: 'firearms',
              range: '30m',
              handlerNotes: 'secret handler text'
            }
          }

          const header = await buildInventorySummaryHeader(weapon)
          assert.isAtLeast(header.length, 1)
          assert.isFalse(
            header.some((row) => String(row.value).includes('secret handler'))
          )
        })

        it('buildHandlerNotesChatHtml wraps handler notes for tomes and rituals', async function () {
          const { buildHandlerNotesChatHtml } = await dgImport(
            '/systems/deltagreen/module/item/inventory-actions.js'
          )

          const ritual = {
            type: 'ritual',
            system: { handlerNotes: 'GM only text' }
          }
          const html = await buildHandlerNotesChatHtml(ritual)
          assert.include(html, 'inventory-chat-handler-notes')
          assert.include(html, 'GM only text')

          const gear = { type: 'gear', system: { handlerNotes: 'ignored' } }
          assert.equal(await buildHandlerNotesChatHtml(gear), '')
        })

        it('isSubstantiveSanityLossFormula omits empty and constant zero formulas', async function () {
          const { isSubstantiveSanityLossFormula } = await dgImport(
            '/systems/deltagreen/module/chat/inventory-roll-html.js'
          )

          assert.isFalse(isSubstantiveSanityLossFormula(''))
          assert.isFalse(isSubstantiveSanityLossFormula('0'))
          assert.isFalse(isSubstantiveSanityLossFormula(' 0 '))
          assert.isTrue(isSubstantiveSanityLossFormula('1D6'))
          assert.isTrue(isSubstantiveSanityLossFormula('1'))
        })

        it('resolveRitualStudyOutcome maps failed sanity roll to learn and success to resisted learn', async function () {
          const { resolveRitualStudyOutcome } = await dgImport(
            '/systems/deltagreen/module/item/inventory-actions.js'
          )

          const ritual = {
            system: {
              learnedSanity: {
                successLoss: '1D4',
                failedLoss: '1D6'
              }
            }
          }

          const resistedOutcome = resolveRitualStudyOutcome(
            { isSuccess: true },
            ritual
          )
          assert.isFalse(resistedOutcome.didLearn)
          assert.equal(resistedOutcome.sanFormula, '1D4')
          assert.equal(
            resistedOutcome.publicMessageKey,
            'DG.Inventory.RitualLearnFailed'
          )

          const learnOutcome = resolveRitualStudyOutcome(
            { isSuccess: false },
            ritual
          )
          assert.isTrue(learnOutcome.didLearn)
          assert.equal(learnOutcome.sanFormula, '1D6')
        })

        it('formatRitualLearnSuccessMessage includes unnatural increase when configured', async function () {
          const { formatRitualLearnSuccessMessage } = await dgImport(
            '/systems/deltagreen/module/item/inventory-actions.js'
          )

          const actor = { name: 'Agent Smith' }
          const ritual = {
            name: 'Summoning',
            type: 'ritual',
            system: { unnaturalSkillIncrease: 2, revealed: true },
          }

          const withIncrease = formatRitualLearnSuccessMessage(actor, ritual)
          assert.include(withIncrease, 'Agent Smith')
          assert.include(withIncrease, 'Summoning')
          assert.include(withIncrease, '2')

          ritual.system.unnaturalSkillIncrease = 0
          const withoutIncrease = formatRitualLearnSuccessMessage(actor, ritual)
          assert.include(withoutIncrease, 'Agent Smith learned Summoning.')
          assert.notInclude(withoutIncrease, 'Unnatural')
        })

        it('applyRitualLearnRewards marks learned and increases unnatural skill without changing SAN', async function () {
          const { applyRitualLearnRewards } = await dgImport(
            '/systems/deltagreen/module/item/inventory-actions.js'
          )

          const actor = await createTestAgent('inv-learn-rewards')
          try {
            await waitForActorBootstrap(actor)
            await actor.update({
              'system.sanity.value': 40,
              'system.skills.unnatural.proficiency': 5
            })

            const itemData = (await createTestItem('ritual', 'reward-ritual')).toObject()
            itemData.system.unnaturalSkillIncrease = 3
            const [item] = await actor.createEmbeddedDocuments('Item', [itemData])

            await applyRitualLearnRewards({ actor, item })
            actor.reset()
            item.reset()

            assert.isTrue(item.system.learned)
            assert.equal(actor.system.sanity.value, 40)
            assert.equal(actor.system.skills.unnatural.proficiency, 8)
          } finally {
            await deleteTestActor(actor)
          }
        })

        it('isInventoryAutomationEnabled respects ritual world settings', async function () {
          const { isInventoryAutomationEnabled } = await dgImport(
            '/systems/deltagreen/module/item/inventory-actions.js'
          )

          await withSetting('automateInventoryRitualLearn', false, async () => {
            assert.isFalse(isInventoryAutomationEnabled('ritualLearn'))
          })
          assert.isTrue(isInventoryAutomationEnabled('ritualLearn'))
        })

        it('resolveRitualStudyRollMessageMode uses blind or GM chat mode', async function () {
          const { resolveRitualStudyRollMessageMode } = await dgImport(
            '/systems/deltagreen/module/item/inventory-actions.js'
          )

          assert.equal(resolveRitualStudyRollMessageMode(false), 'blind')

          await withSetting('showRitualStudyRollsToPlayers', true, async () => {
            const mode = resolveRitualStudyRollMessageMode(true)
            const coreMode = game.settings.get('core', 'messageMode')
              ?? game.settings.get('core', 'rollMode')
            assert.equal(mode, coreMode)
          })
        })

        it('ritual study sanity roll ignores roll-target AE penalties', async function () {
          const actor = await createTestAgent('ritual-study-san-ae')
          try {
            await actor.update({ 'system.sanity.value': 45 })
            await createActorEmbeddedEffect(actor, {
              name: 'SAN roll penalty',
              img: 'icons/svg/aura.svg',
              transfer: false,
              disabled: false,
              changes: [
                {
                  key: 'system.rollTarget.sanity',
                  type: 'add',
                  value: '-15',
                  phase: 'final',
                  priority: 20
                }
              ]
            })
            actor.reset()

            const { DGPercentileRoll } = await dgImport(
              '/systems/deltagreen/module/roll/roll.js'
            )

            const normalRoll = new DGPercentileRoll(
              '1D100',
              {},
              { rollType: 'sanity', key: 'sanity', actor }
            )
            assert.equal(normalRoll.effectiveTarget, 30)

            const studyRoll = new DGPercentileRoll(
              '1D100',
              {},
              {
                rollType: 'sanity',
                key: 'sanity',
                actor,
                ignoreRollTargetModifiers: true
              }
            )
            assert.equal(studyRoll.rollTargetModifier, 0)
            assert.equal(studyRoll.effectiveTarget, 45)
          } finally {
            await deleteTestActor(actor)
          }
        })

        it('buildInventoryChatRollLabel prefixes bond names with a Bond label', async function () {
          const { buildInventoryChatRollLabel } = await dgImport(
            '/systems/deltagreen/module/item/inventory-actions.js'
          )

          const bond = { type: 'bond', name: 'Alex', system: {} }
          const label = buildInventoryChatRollLabel(bond)
          assert.include(label, '<b>')
          assert.include(label, 'Bond')
          assert.include(label, 'Alex')
        })

        it('postInventoryChatCard passes messageMode through createDGChatMessage', async function () {
          const { postInventoryChatCard } = await dgImport(
            '/systems/deltagreen/module/chat/inventory-chat.js'
          )

          const actor = await createTestAgent('inv-chat-card')
          try {
            await waitForActorBootstrap(actor)
            const before = game.messages.size
            await postInventoryChatCard({
              actor,
              rollLabel: 'Test Gear',
              headerLines: [{ labelKey: 'DG.Gear.Equipped', value: '✓' }],
              descriptionHtml: '<p>Visible description</p>',
              messageMode: 'selfroll'
            })

            assert.isAbove(game.messages.size, before)
            const message = game.messages.contents.at(-1)
            assert.deepEqual(message.whisper, [game.user.id])
            assert.isFalse(message.blind)
          } finally {
            await deleteTestActor(actor)
          }
        })

        it('weapon attack inventory card omits description content', async function () {
          if (!packAvailable('deltagreen.firearms')) this.skip()

          const { postInventoryChatCard } = await dgImport(
            '/systems/deltagreen/module/chat/inventory-chat.js'
          )

          const actor = await createTestAgent('inv-weapon-card')
          try {
            await waitForActorBootstrap(actor)
            const weapon = await addCompendiumItemToActor(
              actor,
              'deltagreen.firearms'
            )
            await weapon.update({
              'system.description': '<p>Should not appear on weapon attack path</p>'
            })

            const message = await postInventoryChatCard({
              actor,
              rollLabel: weapon.name,
              headerLines: [{ labelKey: 'DG.Gear.DamageOrLethality', value: '1D10' }],
              descriptionHtml: '',
              item: weapon
            })

            assert.notInclude(message.content, 'Should not appear')
            assert.notInclude(message.content, 'inventory-chat-description')
          } finally {
            await deleteTestActor(actor)
          }
        })

        it('compareSystemVersions and isAtLeastVersion handle beta releases', async function () {
          const { compareSystemVersions, isAtLeastVersion } = await dgImport(
            '/systems/deltagreen/module/utils/system-version.js'
          )

          assert.equal(compareSystemVersions('2.0.0-beta3', '2.0.0-beta4'), -1)
          assert.equal(compareSystemVersions('2.0.0', '2.0.0-beta3'), 1)
          assert.equal(compareSystemVersions('1.7.0', '2.0.0-beta1'), -1)
          assert.isFalse(isAtLeastVersion('2.0.0-beta1', '2.0.0'))
          assert.isTrue(isAtLeastVersion('2.0.0-beta1', '1.9.0'))
          assert.isTrue(isAtLeastVersion('2.1.0', '2.0.0'))
        })

        it('buildRitualMigrationNoticeContent lists rituals and handles empty worlds', async function () {
          const { buildRitualMigrationNoticeContent } = await dgImport(
            '/systems/deltagreen/module/utils/ritual-migration-notice.js'
          )

          const empty = await buildRitualMigrationNoticeContent()
          assert.notInclude(empty, 'entity-link')

          const actor = await createTestAgent('inv-migration')
          try {
            await waitForActorBootstrap(actor)
            const itemData = (await createTestItem('ritual', 'Migration Ritual')).toObject()
            await actor.createEmbeddedDocuments('Item', [itemData])

            const html = await buildRitualMigrationNoticeContent()
            assert.match(html, /<ul class="inventory-ritual-migration-list">[\s\S]*<ul>/)
            assert.match(html, /(entity-link|content-link)/)
            assert.include(html, 'Migration Ritual')
            assert.include(html, actor.name)
          } finally {
            await deleteTestActor(actor)
          }
        })
      })
    },
    { displayName: 'Delta Green inventory UX' }
  )
}
