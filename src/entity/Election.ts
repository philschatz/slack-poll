import {Entity, PrimaryGeneratedColumn, Column, OneToMany, ColumnOptions, CreateDateColumn} from "typeorm";
import { Ballot } from './Ballot';

export const arrayOptions: ColumnOptions = {
    array: false,
    type: 'simple-json'
}

@Entity()
export class Election {

    @PrimaryGeneratedColumn()
    id: number;

    @CreateDateColumn()
    created_at: Date

    @Column()
    slack_team_id: string

    @Column()
    slack_user_id: string

    @Column()
    slack_message_ts: string

    @Column()
    slack_channel_id: string

    @Column()
    description: string;

    @Column(arrayOptions)
    options: string[]

    @OneToMany(() => Ballot, b => b.election, {eager: true})
    ballots: Ballot[]
}
