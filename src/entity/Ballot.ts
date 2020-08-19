import {Entity, PrimaryGeneratedColumn, Column, ManyToOne} from "typeorm";
import { Election, arrayOptions } from './Election';
import { User } from './User';

@Entity()
export class Ballot {

    @PrimaryGeneratedColumn()
    id: number;

    // @CreateDateColumn()
    // created_at: Date

    // @UpdateDateColumn()
    // updated_at: Date

    @ManyToOne(() => Election, e => e.ballots)
    election: Election;

    @ManyToOne(() => User, e => e.ballots)
    user: User

    @Column(arrayOptions)
    rankedChoices: number[]
}
