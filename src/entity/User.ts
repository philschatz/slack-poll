import {Entity, PrimaryGeneratedColumn, Column, OneToMany} from "typeorm";
import { Ballot } from './Ballot';

@Entity()
export class User {

    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    slackId: string;

    @OneToMany(() => Ballot, e => e.user_id, {eager: true})
    ballots: Ballot[]
}
