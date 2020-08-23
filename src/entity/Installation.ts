import {Entity, Column, PrimaryColumn} from "typeorm";
@Entity()
export class Installation {

    @PrimaryColumn()
    slack_team_id: string;

    @Column()
    slack_json: string;
}
