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
    question: string;

    @Column(arrayOptions)
    options: string[]

    @OneToMany(() => Ballot, b => b.election, {eager: true})
    ballots: Ballot[]
}
