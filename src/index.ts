import "reflect-metadata";
import {createConnection} from "typeorm";
import {User} from "./entity/User";
import { Ballot } from './entity/Ballot';
import { Election } from './entity/Election';

createConnection().then(async connection => {

    console.log("Inserting a new user into the database...")
    const user = new User()
    user.slackId = 'philschatz'
    const election = new Election()
    election.question = 'What is your favorite color?'
    election.options = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet']

    const ballot = new Ballot()
    ballot.election = election
    ballot.user = user

    ballot.rankedChoices = [4, 1,]

    await connection.manager.save([election, user, ballot])

    console.log("Loading users from the database...");
    const ballots = await connection.manager.find(Ballot);
    console.log("Loaded all ballots: ", ballots);

    console.log('Ballots for this newly-created election:', election.ballots)
    const theElection = await connection.manager.findOneOrFail(Election, {id: election.id})
    console.log('Ballots for all elections:', theElection.ballots)
    

    console.log("Here you can setup and run express/koa/any other framework.");

}).catch(error => console.log(error));
