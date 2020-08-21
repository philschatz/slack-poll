import 'reflect-metadata'
import 'dotenv-safe'
import { App, LogLevel } from '@slack/bolt'
import { createConnection } from 'typeorm'
import { User } from './entity/User'
import { Ballot } from './entity/Ballot'
import { Election } from './entity/Election'

const slackCommand = 'poll'

createConnection().then(async connection => {
  console.log('Inserting a new user into the database...')
  const user = new User()
  user.slackId = 'philschatz'
  const election = new Election()
  election.question = 'What is your favorite color?'
  election.options = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet']

  const ballot = new Ballot()
  ballot.election = election
  ballot.user = user

  ballot.rankedChoices = [4, 1]

  await connection.manager.save([election, user, ballot])

  console.log('Loading users from the database...')
  const ballots = await connection.manager.find(Ballot)
  console.log('Loaded all ballots: ', ballots)

  console.log('Ballots for this newly-created election:', election.ballots)
  const theElection = await connection.manager.findOneOrFail(Election, { id: election.id })
  console.log('Ballots for all elections:', theElection.ballots)

  console.log('Here you can setup and run express/koa/any other framework.')

  // Initializes your app with your bot token and signing secret
  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    logLevel: LogLevel.DEBUG
  })

  const mtext = (text: string) => ({ type: 'mrkdwn', text })
  const ptext = (text: string) => ({ emoji: true, type: 'plain_text', text })

  app.command(`/${slackCommand}`, async ({ command, ack, context, client }) => {
    // Acknowledge the command request
    await ack()

    const none = {
      text: ptext('None'),
      value: 'VALUE_NONE'
    }

    const deleteConfirm = {
      style: 'danger',
      title: ptext('Delete Poll?'),
      text: ptext('Are you sure you want to delete this unpublished Poll?'),
      confirm: ptext('Delete'),
      deny: ptext('Cancel')
    }

    const description = 'What are the best foods?'
    const CANDIDATE_NAMES = [
      ':apple: Apple',
      ':banana: Banana',
      ':cherries: Cherry'
    ]

    const blocks = [
      {
        type: 'section',
        text: mtext(':writing_hand: Edit *Draft Poll*')
      },

      { type: 'divider' },

      {
        type: 'section',
        text: mtext(`*Description:* ${description}`),
        accessory: {
          type: 'overflow',
          action_id: 'ELECTION_OVERFLOW',
          options: [
            { value: 'EDIT', text: ptext(':writing_hand: Edit Description') },
            { value: 'DELETE', text: ptext(':x: Delete Poll') }
          ]
        }
      },

      { type: 'divider' },

      {
        type: 'section',
        text: mtext('*Choices:*')
      },

      ...CANDIDATE_NAMES.map((name, index) => {
        const options = [
          { value: 'EDIT', text: ptext(':writing_hand: Edit Option') },
          { value: 'DELETE', text: ptext(':x: Delete Option') }
        ]

        if (index > 0) {
          options.push({ value: 'MOVE_UP', text: ptext(':arrow_up: Move Up') })
        }
        if (index < CANDIDATE_NAMES.length - 1) {
          options.push({ value: 'MOVE_DOWN', text: ptext(':arrow_down: Move Down') })
        }

        return {
          type: 'section',
          text: mtext(name),
          accessory: {
            type: 'overflow',
            action_id: `CANDIDATE-${index}`,
            options
          }
        }
      }),

      { type: 'divider' },

      {
        type: 'section',
        text: mtext('*Settings:* Anonymous, Ranked, 4 Winners'),
        accessory: { type: 'button', text: ptext('Edit'), value: 'EDIT_SETTINGS' }
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
        text: mtext('the option text is here :apple:'),
        accessory: {
          type: 'static_select',
          action_id: 'CANDIDATE_1',
          placeholder: ptext('Rank the Candidate'),
          initial_option: none,
          options: [
            none,
            { text: ptext('1'), value: 'VALUE_1' },
            { text: ptext('2'), value: 'VALUE_2' },
            { text: ptext('3'), value: 'VALUE_3' }
          ]
        }
      }

    ]

    await client.chat.postEphemeral({
      token: context.botToken,
      channel: command.channel_id,
      user: command.user_id,
      blocks: blocks,
      text: 'help text'
    })
  });

  (async () => {
    // Start your app
    await app.start(process.env.PORT || 3000)

    console.log('⚡️ Bolt app is running!')
  })()
}).catch(err => console.error(err))

process.on('unhandledRejection', (err) => {
  throw err
})
