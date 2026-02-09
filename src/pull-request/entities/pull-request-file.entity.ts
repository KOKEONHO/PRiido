import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PullRequest } from './pull-request.entity';

@Entity('pull_request_file')
export class PullRequestFile {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
  id: string;

  @Column({ name: 'pull_request_id', type: 'bigint' })
  pullRequestId: string;

  @Column({ name: 'filename', type: 'text' })
  filename: string;

  @Column({ name: 'status', type: 'varchar', length: 30, nullable: true })
  status: string | null;

  @Column({ name: 'additions', type: 'int', nullable: true })
  additions: number | null;

  @Column({ name: 'deletions', type: 'int', nullable: true })
  deletions: number | null;

  @Column({ name: 'changes', type: 'int', nullable: true })
  changes: number | null;

  @ManyToOne(() => PullRequest, (pr) => pr.fileRows, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pull_request_id' })
  pullRequest: PullRequest;
}
