import {Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn} from "typeorm";
import { Election, arrayOptions } from './Election';

@Entity()
export class Ballot {

    @PrimaryGeneratedColumn()
    id: number;

    @CreateDateColumn()
    created_at: Date

    @UpdateDateColumn()
    updated_at: Date

    @ManyToOne(() => Election, e => e.ballots)
    election: Election;

    @Column()
    user_id: string

    @Column(arrayOptions)
    ranked_choices: number[]
}
