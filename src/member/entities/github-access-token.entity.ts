import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Member } from './member.entity';

@Entity('github_access_token')
export class GithubAccessToken {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'member_id', type: 'bigint', unique: true })
  memberId: string;

  @Column({ name: 'access_token', type: 'text' })
  accessToken: string;

  @OneToOne(() => Member, (m) => m.githubAccessToken, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'member_id' })
  member: Member;
}
