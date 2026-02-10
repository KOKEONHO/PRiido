import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PullRequest } from './pull-request.entity';

@Entity('pull_request_commit')
export class PullRequestCommit {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
  id: string;

  @Column({ name: 'pull_request_id', type: 'bigint' })
  pullRequestId: string;

  @Column({ name: 'sha', type: 'varchar', length: 80 })
  sha: string;

  @Column({ name: 'message', type: 'text' })
  message: string;

  @Column({ name: 'author', type: 'varchar', length: 255, nullable: true })
  author: string | null;

  @Column({ name: 'committed_at_github', type: 'timestamptz', nullable: true })
  committedAtGithub: Date | null;

  @ManyToOne(() => PullRequest, (pr) => pr.commitRows, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pull_request_id' })
  pullRequest: PullRequest;
}
