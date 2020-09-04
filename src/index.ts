import 'reflect-metadata'
import 'dotenv-safe'
import { App, LogLevel } from '@slack/bolt'
import { createConnection } from 'typeorm'
import { Ballot } from './entity/Ballot'
import { Election } from './entity/Election'
import { Installation } from './entity/Installation'

const slackCommand = 'poll-ranked'

const DEFAULT_CANDIDATES = [
  ':apple: Apple',
  ':banana: Banana',
  ':cherries: Cherry',
  ':doughnut: Doughnut',
  ':egg: Egg'
]

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

const toNth = (n: number) => {
  switch (n) {
    case 0: return 'Zeroth'
    case 1: return 'First'
    case 2: return 'Second'
    case 3: return 'Third'
    case 4: return 'Fourth'
    default:
      return `${n}th`
  }
}

const buildPollMessageBlcoks = (context: Election) => {
  const deleteConfirm = {
    style: 'danger',
    title: ptext('Delete Poll?'),
    text: ptext('Are you sure you want to delete this unpublished Poll?'),
    confirm: ptext('Delete'),
    deny: ptext('Cancel')
  }

  let voterStats = []
  if (context.ballots && context.ballots.length > 0) {
    voterStats = [    {
      type: 'section',
      text: mtext(`Voters: ${context.ballots.map(b => `<@${b.user_id}>`).join(' ')}`)
    }]
  }

  return [
    {
      type: 'section',
      text: mtext(`*${context.description}*`),
    },

    {
      type: 'section',
      text: mtext(`Rank the options`),
    },

    { 
      type: 'actions',
      elements: context.options.map((name, index) => {
        const options = [
          // { value: cmdIdValue('EDIT_OPTION', index), text: ptext(':writing_hand: Edit Option') },
          // { value: cmdIdValue('DELETE_OPTION', index), text: ptext(':x: Delete Option') }
        ]
  
        if (index > 0) {
          options.push({ value: cmdIdValue('MOVE_UP', index), text: ptext(':arrow_up: Move Up') })
        }
        if (index < context.options.length - 1) {
          options.push({ value: cmdIdValue('MOVE_DOWN', index), text: ptext(':arrow_down: Move Down') })
        }
  
        return {
          type: 'button',
          text: ptext(name),
          action_id: `RANK_CANDIDATES_POPUP:${index}`
        }
      })
    },

    ...voterStats,

    { type: 'divider' },

    {
      type: 'actions', 
      elements: [
        { type: 'button', text: ptext(':x: Delete Poll'), action_id: 'DELETE', style: 'danger', confirm: deleteConfirm },
      ]
    },

  ]
}

createConnection().then(async connection => {
  const ballots = await connection.manager.find(Ballot)
  console.log('Loaded all ballots: ', ballots)

  // console.log('Ballots for this newly-created election:', election.ballots)
  // const theElection = await connection.manager.findOneOrFail(Election, { id: election.id })
  // console.log('Ballots for all elections:', theElection.ballots)

  // console.log('Here you can setup and run express/koa/any other framework.')

  function newElection () {
    const election = new Election()
    election.description = 'What are the best foods?'
    election.options = [
      ':apple: Apple',
      ':banana: Banana',
      ':cherries: Cherry',
      ':doughnut: Doughnut',
      ':egg: Egg'
    ]
    return election
  }

  async function getElection(teamId: string,messageTs: string) {
    return await connection.manager.findOneOrFail(Election, {slack_team_id: teamId, slack_message_ts: messageTs})
  }
  async function getBallotOrNew(teamId: string,messageTs: string, userId: string) {
    if (!teamId || !messageTs || !userId) {
      throw new Error(`Missing args ${teamId} ${messageTs} ${userId}`)
    }
    console.log(`lookingfor ${teamId} ${messageTs} ${userId}`)
    const election = await getElection(teamId, messageTs)
    let ballot = election.ballots.find(b => b.user_id === userId)
    if (!ballot) {
      ballot = new Ballot()
      ballot.election = election
      ballot.user_id = userId
      ballot.ranked_choices = []
    } else {
      console.log('foundballot', ballot)
    }
    return ballot
  }

  async function doUpdate (election: Election, context) {
    await connection.manager.save(election)
    await app.client.chat.update({
      token: context.botToken,
      channel: election.slack_channel_id,
      ts: election.slack_message_ts,
      blocks: buildPollMessageBlcoks(election),
      text: 'Update Poll'
    })
  }

  // Initializes your app with your bot token and signing secret
  const app = new App({
    // token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
    stateSecret: process.env.SLACK_STATE_SECRET,
    logLevel: LogLevel.DEBUG,
    scopes: ['chat:write', 'chat:write.public', 'commands', 'im:write'],
    installationStore: {
      storeInstallation: async (installation) => {
        const inst = new Installation()
        inst.slack_team_id = installation.team.id
        inst.slack_json = JSON.stringify(installation)
        await connection.manager.save(inst)
      },
      fetchInstallation: async (InstallQuery) => {
        const inst = await connection.manager.findOneOrFail(Installation, { slack_team_id: InstallQuery.teamId })
        const json = JSON.parse(inst.slack_json)
        return json
      }
    }
  })

  app.command(`/${slackCommand}`, async (args) => {
    const { ack, context, body } = args
    await ack()

    const originalMessage = JSON.stringify({ channelId: body.channel_id, userId: body.user_id })


    await app.client.views.open({
      token: context.botToken,
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        private_metadata: JSON.stringify(originalMessage),
        callback_id: 'CREATE_POLL_MODAL',
        title: ptext('Create a Poll'),
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
              multiline: true
            }
          },
          { type: 'section', text: ptext('Choices:\nEnter the candidates.') },

          // Generate 1 textbox for each choice
          ...DEFAULT_CANDIDATES.map((candidate, i) => ({
            type: 'input',
            optional: true,
            block_id: `THE_CANDIDATE:${i}`,
            label: ptext(`${toNth(i + 1)} Choice`),
            element: {
              type: 'plain_text_input',
              action_id: 'EDIT_CANDIDATE',
              placeholder: ptext('This is what voters will see. (e.g. Grace Hopper)'),
              initial_value: candidate
            }
          })),

          // https://api.slack.com/surfaces/modals/using#modal_response_url
          {
            block_id: 'MAGIC_BLOCK_ID',
            type: 'input',
            optional: true,
            label: ptext('Select a channel to post the result on'),
            element: {
              action_id: 'MAGIC_ACTION_ID',
              type: 'conversations_select',
              response_url_enabled: true,
              default_to_current_conversation: true,
            },
          },  
          

        ]
      }
    })

  })

  function range(from: number, to: number) {
    if (to >= from) {
      const arr = []
      for (let i = from; i < to; i++) {
        arr.push(i)
      }
      return arr
    }
    throw new Error(`BUG: from !<= to '${from}' !<= '${to}'`)
  }
  function rankEntry(candidate: number, i: number | null) {
    if (!i) { // null, 0, or undefined (nothing in the rank array)
      return { text: ptext('None'), value: cmdIdValue('RANK', candidate, null) }
    } else {
      return { text: ptext(`${i}`), value: cmdIdValue('RANK', candidate, i) }
    }
  }

  const buildRankingViewBlocks = (candidates: string[], rankedChoices: number[]) => {
    const maxRank = candidates.length + 1 // Math.max(0, ...rankedChoices) + 1

    return [
      { type: 'section', text: ptext('Rank the candidates') },

      ...candidates.map((candidate, i) => ({
        type: 'section',
        text: mtext(candidate),
        block_id: `RANK_CANDIDATE_BLOCK:${i}`,
        accessory: {
          type: 'static_select',
          action_id: `RANK_CANDIDATE:${i}`,
          placeholder: ptext('Rank the Candidate'),
          initial_option: rankEntry(i, rankedChoices[i]),
          options: range(0, maxRank+1/*inclusive*/).map(ii => rankEntry(i, ii))
        }
      })),

      // Uncomment me as part of: TURN_ON_THE_INPUT_BLOCKS
      //
      // ...candidates.map((candidate, i) => ({
      //   type: 'input',
      //   label: ptext(candidate),
      //   block_id: `RANK_CANDIDATE_BLOCK:${i}`,
      //   element: {
      //     type: 'static_select',
      //     action_id: `RANK_CANDIDATE:${i}`,
      //     placeholder: ptext('Rank the Candidate'),
      //     initial_option: rankEntry(i, rankedChoices[i]),
      //     options: range(0, maxRank+1/*inclusive*/).map(ii => rankEntry(i, ii))
      //   }
      // })),

    ]
  }

  const rankCandidatesPopupHandler = async (args) => {
    const {body, context} = args
    // console.log(args)
    const userId = body.user.id
    const teamId = body.team.id
    const channelId = body.channel.id
    const messageTs = body.message.ts

    const election = await getElection(teamId, messageTs)
    const ballot = await getBallotOrNew(teamId, messageTs, userId)

    await app.client.views.open({
      token: context.botToken,
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        private_metadata: JSON.stringify({userId, teamId, channelId, messageTs}),
        callback_id: 'VOTE_MODAL',
        title: ptext('Vote! Rank Candidates'),
        // close: ptext('Cancel'),
        submit: ptext('Save'),
        blocks: buildRankingViewBlocks(election.options, ballot.ranked_choices)
      }
    })
  }

  app.action('RANK_CANDIDATES_POPUP:0', rankCandidatesPopupHandler)
  app.action('RANK_CANDIDATES_POPUP:1', rankCandidatesPopupHandler)
  app.action('RANK_CANDIDATES_POPUP:2', rankCandidatesPopupHandler)
  app.action('RANK_CANDIDATES_POPUP:3', rankCandidatesPopupHandler)
  app.action('RANK_CANDIDATES_POPUP:4', rankCandidatesPopupHandler)
  app.action('RANK_CANDIDATES_POPUP:5', rankCandidatesPopupHandler)
  app.action('RANK_CANDIDATES_POPUP:6', rankCandidatesPopupHandler)
  app.action('RANK_CANDIDATES_POPUP:7', rankCandidatesPopupHandler)
  app.action('RANK_CANDIDATES_POPUP:8', rankCandidatesPopupHandler)
  app.action('RANK_CANDIDATES_POPUP:9', rankCandidatesPopupHandler)

  app.view('VOTE_MODAL', async (args) => {
    const {ack, body, payload, view} = args
    // Uncomment me as part of: TURN_ON_THE_INPUT_BLOCKS
    // Right now your vote saves every time you change the dropdown
    // console.log('VOTE_MODAL', view.state)
    await ack()
  })

  const rankCandidateHandler = async (args) => {
    const {ack, body, payload, context} = args
    await ack()
    // console.log('rankingthecandidate', args)
    console.log('hereisthemetadata', args.body.view.private_metadata)
    console.log('rankcandidatehandler', args)

    const {messageTs} = JSON.parse(body.view.private_metadata)

    const teamId = body.team.id
    const userId = body.user.id
    const ballot = await getBallotOrNew(teamId, messageTs, userId)
    console.log('ballot', ballot)
    const indexStr = payload.action_id.split(':')[1]
    const candidateIndex = Number.parseInt(indexStr)
    if (Number.isNaN(candidateIndex)) {
      throw new Error(`BUG: Invalid candidate index '${indexStr}'`)
    }
    const {id, value} = JSON.parse(payload.selected_option.value)
    ballot.ranked_choices[id] = value

    await connection.manager.save(ballot)
    await doUpdate(await getElection(teamId, messageTs), context)

  }

  app.action('RANK_CANDIDATE:0', rankCandidateHandler)
  app.action('RANK_CANDIDATE:1', rankCandidateHandler)
  app.action('RANK_CANDIDATE:2', rankCandidateHandler)
  app.action('RANK_CANDIDATE:3', rankCandidateHandler)
  app.action('RANK_CANDIDATE:4', rankCandidateHandler)
  app.action('RANK_CANDIDATE:5', rankCandidateHandler)
  app.action('RANK_CANDIDATE:6', rankCandidateHandler)
  app.action('RANK_CANDIDATE:7', rankCandidateHandler)


  app.view('MAGIC_ACTION_ID', async (args) => {
    console.log('kjfkwehfwjkehrfwkjehf', args)
  })
  
  app.view('CREATE_POLL_MODAL', async ({ ack, view, context, body, payload }) => {
    ack()

    const channelId = view.state.values.MAGIC_BLOCK_ID.MAGIC_ACTION_ID.selected_conversation

    const election = new Election()
    election.description = view.state.values.THE_DESCRIPTION_INPUT.EDIT_DESCRIPTION_TEXT.value

    const optionKeys = Object.keys(view.state.values).filter(v => v.startsWith('THE_CANDIDATE:'))
    election.options = optionKeys.map(k => view.state.values[k].EDIT_CANDIDATE.value).filter(o => !!o) // remove blank entries

    const result = await app.client.chat.postMessage({
      token: context.botToken,
      channel: channelId,
      text: 'The Poll',
      blocks: buildPollMessageBlcoks(election)
    })

    if (result.ok) {
      const messageTs = result.ts as string
      const actualChannelId = result.channel as string

      election.slack_message_ts = messageTs
      election.slack_channel_id = actualChannelId
      election.slack_team_id = payload.team_id
      election.slack_user_id = body.user.id

      if (!election.slack_channel_id || !election.slack_message_ts || !election.slack_user_id) {
        console.log('invalidmessage or channel', result)
        throw new Error('Invalid message ts or channel id')
      }

      await connection.manager.save(election)

      console.log('Created', election.slack_team_id, election.slack_channel_id, election.slack_message_ts, election.slack_user_id)
    } else {
      throw new Error('ERROR: Could not create message')
    }

    // await doUpdate(election, context, channelId, messageTs)
  })

  app.action('ADD_CANDIDATE_POPUP', async ({ ack, body, context }) => {
    if (body.type !== 'block_actions') { throw new Error('Unreachable!') }
    await ack()

    const originalMessage = JSON.stringify({ channelId: body.container.channel_id, messageTs: body.container.message_ts })

    await app.client.views.open({
      token: context.botToken,
      trigger_id: body.trigger_id,
      view: {
        private_metadata: originalMessage,
        type: 'modal',
        callback_id: 'ADD_CANDIDATE_MODAL',
        title: ptext('Add Another Choice'),
        close: ptext('Cancel'),
        submit: ptext('Save'),
        blocks: [
          {
            type: 'input',
            block_id: 'THE_CANDIDATE_INPUT',
            label: ptext('Enter a description for choice so people know what they are choosing'),
            element: {
              type: 'plain_text_input',
              action_id: 'EDIT_CANDIDATE_TEXT',
              placeholder: ptext('Enter a description of the choice')
            }
          }
        ]
      }
    })
  })

  app.view('ADD_CANDIDATE_MODAL', async ({ ack, view, context, body }) => {
    ack()

    const { channelId, messageTs } = JSON.parse(view.private_metadata)
    const election = await getElection(body.team.id, messageTs)
    const newCandidate = view.state.values.THE_CANDIDATE_INPUT.EDIT_CANDIDATE_TEXT.value

    election.options.push(newCandidate)

    await connection.manager.save(election)

    await doUpdate(election, context)
  })

  app.action('EDIT_CANDIDATE', async (args) => {
    const { ack, payload, context, body } = args
    await ack()

    if (body.type !== 'block_actions') { throw new Error('Unreachable!') }
    if (payload.type !== 'overflow') { throw new Error('Unreachable!') }

    const election = await getElection(body.user.team_id, body.message.ts)

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

    await doUpdate(election, context)
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
    await app.client.chat.delete({
      token: context.botToken,
      channel: body.container.channel_id,
      ts: body.container.message_ts
    })
    const election = await getElection(body.user.team_id, body.message.ts)
    await connection.manager.remove(election)
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
