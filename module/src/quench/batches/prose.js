import { createTestAgent, deleteTestActor, dgImport } from '../helpers.js'

export default function register (quench) {
  quench.registerBatch(
    'deltagreen.prose',
    (context) => {
      const { describe, it, assert } = context

      describe('Prose / HTML fields', function () {
        it('updates and persists physical description', async function () {
          const actor = await createTestAgent('prose')
          const html = '<p>Quench prose test</p>'
          try {
            await actor.update({ 'system.physical.description': html })
            assert.equal(actor.system.physical.description, html)
            actor.reset()
            assert.equal(
              actor._source.system.physical.description,
              html
            )
            const refetched = game.actors.get(actor.id)
            assert.equal(refetched.system.physical.description, html)
          } finally {
            await deleteTestActor(actor)
          }
        })

        it('prepareProseMirrorInput includes saved content', async function () {
          const actor = await createTestAgent('prose-input')
          const html = '<p>Mirror box</p>'
          try {
            await actor.update({ 'system.physical.description': html })
            const { prepareProseMirrorInput } = await dgImport(
              '/systems/deltagreen/module/utils/rich-text.js'
            )
            const markup = await prepareProseMirrorInput(
              actor,
              'physical.description'
            )
            assert.include(markup, 'Mirror box')
          } finally {
            await deleteTestActor(actor)
          }
        })

        it('prepareProseMirrorInput preserves unrevealed secrets for document owners', async function () {
          if (!game.user.isGM) this.skip()

          const actor = await createTestAgent('prose-secret')
          const html =
            '<section class="secret"><p>GM-only prose secret</p></section>'
          try {
            await actor.update({ 'system.physical.description': html })
            const { prepareProseMirrorInput } = await dgImport(
              '/systems/deltagreen/module/utils/rich-text.js'
            )
            const markup = await prepareProseMirrorInput(
              actor,
              'physical.description'
            )
            assert.include(markup, 'GM-only prose secret')
          } finally {
            await deleteTestActor(actor)
          }
        })

        it('enrichHTML defaults secrets from relativeTo.isOwner', async function () {
          if (!game.user.isGM) this.skip()

          const actor = await createTestAgent('enrich-secret')
          const html =
            '<section class="secret"><p>Owner-visible secret</p></section>'
          try {
            const enrichHTML = (
              await dgImport('/systems/deltagreen/module/utils/enrich-html.js')
            ).default
            const result = await enrichHTML(html, {
              async: true,
              relativeTo: actor,
            })
            assert.include(result, 'Owner-visible secret')

            const stripped = await enrichHTML(html, {
              async: true,
              relativeTo: actor,
              secrets: false,
            })
            assert.notInclude(stripped, 'Owner-visible secret')

            const forced = await enrichHTML(html, {
              async: true,
              relativeTo: actor,
              secrets: true,
            })
            assert.include(forced, 'Owner-visible secret')
          } finally {
            await deleteTestActor(actor)
          }
        })
      })
    },
    { displayName: 'Prose fields', preSelected: false }
  )
}
