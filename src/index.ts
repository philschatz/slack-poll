import 'reflect-metadata'
import 'dotenv-safe'
import { App, LogLevel } from '@slack/bolt'
import { createConnection } from 'typeorm'
import { Ballot } from './entity/Ballot'
import { Election } from './entity/Election'

const slackCommand = 'poll'

const mtext = (text: string) => ({ type: 'mrkdwn', text })
const ptext = (text: string): {emoji: true, type: 'plain_text', text: string} => ({ emoji: true, type: 'plain_text', text })
const cmdIdValue = (command: string, id: number, value?: number) => JSON.stringify({ command, id, value })
const parseCmdIdValue = (json: string) => JSON.parse(json) as {command: string, id: number, value?: number}

function moveUp<T> (arr: T[], index: number) {
  if (index > 0) {
    const el = arr[index]
    arr[index] = arr[index - 1]
    arr[index - 1] = el
  }
}

function moveDown<T> (arr: T[], index: number) {
  if (index !== -1 && index < arr.length - 1) {
    const el = arr[index]
    arr[index] = arr[index + 1]
    arr[index + 1] = el
  }
}

const buildDraftBlocks = (context: Election) => {
  const deleteConfirm = {
    style: 'danger',
    title: ptext('Delete Poll?'),
    text: ptext('Are you sure you want to delete this unpublished Poll?'),
    confirm: ptext('Delete'),
    deny: ptext('Cancel')
  }

  return [
    {
      type: 'section',
      text: mtext(':writing_hand: Edit *Draft Poll*')
    },

    { type: 'divider' },

    {
      type: 'section',
      text: mtext(`*Description:* ${context.description}`),
      accessory: {
        type: 'button',
        action_id: 'EDIT_DESCRIPTION_POPUP',
        text: ptext('Edit')
      }
    },

    { type: 'divider' },

    {
      type: 'section',
      text: mtext('*Choices:*')
    },

    ...context.options.map((name, index) => {
      const options = [
        { value: cmdIdValue('EDIT_OPTION', index), text: ptext(':writing_hand: Edit Option') },
        { value: cmdIdValue('DELETE_OPTION', index), text: ptext(':x: Delete Option') }
      ]

      if (index > 0) {
        options.push({ value: cmdIdValue('MOVE_UP', index), text: ptext(':arrow_up: Move Up') })
      }
      if (index < context.options.length - 1) {
        options.push({ value: cmdIdValue('MOVE_DOWN', index), text: ptext(':arrow_down: Move Down') })
      }

      return {
        type: 'section',
        text: mtext(name),
        accessory: {
          type: 'overflow',
          action_id: 'EDIT_CANDIDATE',
          options
        }
      }
    }),

    { type: 'divider' },

    {
      type: 'section',
      text: mtext('*Settings:* Anonymous, Ranked, 4 Winners'),
      accessory: { type: 'button', text: ptext('Edit'), action_id: 'EDIT_SETTINGS' }
    },

    { type: 'divider' },

    {
      type: 'actions',
      elements: [
        { type: 'button', text: ptext('Publish'), action_id: 'PUBLISH' },
        { type: 'button', text: ptext(':x: Delete'), action_id: 'DELETE', style: 'danger', confirm: deleteConfirm }
      ]
    },

    {
      type: 'section',
      text: mtext(`the option text is here :apple: Random: ${Math.round(Math.random() * 1000)}`),
      accessory: {
        type: 'static_select',
        action_id: 'RANK_CANDIDATE',
        placeholder: ptext('Rank the Candidate'),
        initial_option: { text: ptext('None'), value: cmdIdValue('RANK', 0, null) },
        options: [
          { text: ptext('None'), value: cmdIdValue('RANK', 0, null) },
          { text: ptext('1'), value: cmdIdValue('RANK', 0, 1) },
          { text: ptext('2'), value: cmdIdValue('RANK', 0, 2) },
          { text: ptext('3'), value: cmdIdValue('RANK', 0, 3) }
        ]
      }
    }

  ]
}

createConnection().then(async connection => {
  const ballots = await connection.manager.find(Ballot)
  console.log('Loaded all ballots: ', ballots)

  // console.log('Ballots for this newly-created election:', election.ballots)
  // const theElection = await connection.manager.findOneOrFail(Election, { id: election.id })
  // console.log('Ballots for all elections:', theElection.ballots)

  // console.log('Here you can setup and run express/koa/any other framework.')

  async function getDraftElection (teamId: string, userId: string, createIfNotFound?: true) {
    let election = await connection.manager.findOne(Election, {
      slack_team: teamId,
      slack_user: userId,
      published_at: null
    })

    if (!election) {
      if (!createIfNotFound) { throw new Error('BUG: Draft election does not exist in the database for this user') }

      election = new Election()
      election.slack_team = teamId
      election.slack_user = userId
      election.description = 'What are the best foods?'
      election.options = [
        ':apple: Apple',
        ':banana: Banana',
        ':cherries: Cherry'
      ]
      await connection.manager.save([election])
    }
    return election
  }

  async function doUpdate (election: Election, context, channelId: string, messageTs: string) {
    await connection.manager.save(election)
    await app.client.chat.update({
      token: context.botToken,
      channel: channelId,
      ts: messageTs,
      blocks: buildDraftBlocks(election),
      text: 'Update Draft Poll'
    })
  }

  // Initializes your app with your bot token and signing secret
  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    logLevel: LogLevel.DEBUG
  })

  app.command(`/${slackCommand}`, async (args) => {
    const { ack, payload, say } = args

    const election = await getDraftElection(payload.team_id, payload.user_id, true)

    await ack()

    await say({
      blocks: buildDraftBlocks(election),
      text: 'create a Poll'
    })
  })

  app.action('EDIT_DESCRIPTION_POPUP', async ({ ack, body, context }) => {
    if (body.type !== 'block_actions') { throw new Error('Unreachable!') }
    await ack()

    const originalMessage = JSON.stringify({ channelId: body.container.channel_id, messageTs: body.container.message_ts })
    const election = await getDraftElection(body.team.id, body.user.id)

    await app.client.views.open({
      token: context.botToken,
      trigger_id: body.trigger_id,
      view: {
        private_metadata: originalMessage,
        type: 'modal',
        callback_id: 'EDIT_DESCRIPTION_MODAL',
        title: ptext('Edit Poll Description'),
        close: ptext('Cancel'),
        submit: ptext('Save'),
        blocks: [
          {
            type: 'input',
            block_id: 'THE_DESCRIPTION_INPUT',
            label: ptext('Enter a description for your Poll so people know what they are voting on'),
            element: {
              type: 'plain_text_input',
              action_id: 'EDIT_DESCRIPTION_TEXT',
              placeholder: ptext('What is this a Poll for?'),
              initial_value: election.description,
              multiline: true
            }
          }
        ]
      }
    })
  })

  app.view('EDIT_DESCRIPTION_MODAL', async ({ ack, view, context, body }) => {
    ack()

    const election = await getDraftElection(body.team.id, body.user.id)
    const newDescription = view.state.values.THE_DESCRIPTION_INPUT.EDIT_DESCRIPTION_TEXT.value

    const { channelId, messageTs } = JSON.parse(view.private_metadata)

    if (election.description !== newDescription) {
      election.description = newDescription

      await connection.manager.save(election)
      await doUpdate(election, context, channelId, messageTs)
    }
  })

  app.action('EDIT_CANDIDATE', async (args) => {
    const { ack, payload, context, body } = args
    await ack()

    if (body.type !== 'block_actions') { throw new Error('Unreachable!') }
    if (payload.type !== 'overflow') { throw new Error('Unreachable!') }

    const election = await getDraftElection(body.user.team_id, body.user.id)

    const { command, id } = parseCmdIdValue(payload.selected_option.value)
    switch (command) {
      case 'MOVE_DOWN':
        moveDown(election.options, id)
        break
      case 'MOVE_UP':
        moveUp(election.options, id)
        break
      default:
        // do nothing
    }

    await doUpdate(election, context, body.container.channel_id, body.container.message_ts)
  })

  app.action('EDIT_SETTINGS', async ({ ack, payload }) => {
    await ack()
    console.log(payload.type, payload)
  })

  app.action('PUBLISH', async ({ ack, payload }) => {
    await ack()
    console.log(payload.type, payload)
  })

  app.action('DELETE', async ({ ack, body, context }) => {
    if (body.type !== 'block_actions') { throw new Error('Unreachable!') }

    await ack()
    const election = await getDraftElection(body.user.team_id, body.user.id)
    await connection.manager.remove(election)
    await app.client.chat.delete({
      token: context.botToken,
      channel: body.container.channel_id,
      ts: body.container.message_ts
    })
  })

  app.action('RANK_CANDIDATE', async ({ ack, payload }) => {
    await ack()
    if (payload.type !== 'static_select') { throw new Error('Unreachable!') }
    console.log(payload.action_id, parseCmdIdValue(payload.selected_option.value))
  })

  ;(async () => {
    await app.start(process.env.PORT || 3000)

    console.log('⚡️ Bolt app is running!')
  })()
}).catch(err => console.error(err))

process.on('unhandledRejection', (err) => {
  throw err
})
