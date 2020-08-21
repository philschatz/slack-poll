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

    @Column({nullable: true})
    published_at: (Date | null)

    @Column()
    slack_team: string

    @Column()
    slack_user: string

    @Column()
    description: string;

    @Column(arrayOptions)
    options: string[]

    @OneToMany(() => Ballot, b => b.election, {eager: true})
    ballots: Ballot[]
}
