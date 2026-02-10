import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Repository } from '../../repository/entities/repository.entity';
import { PullRequestCommit } from './pull-request-commit.entity';
import { PullRequestFile } from './pull-request-file.entity';

@Entity('pull_request')
export class PullRequest {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
  id: string;

  @Column({ name: 'repository_id', type: 'bigint' })
  repositoryId: string;

  @Column({ name: 'github_pr_id', type: 'bigint' })
  githubPrId: string;

  @Column({ name: 'pr_number', type: 'int' })
  prNumber: number;

  @Column({ name: 'title', type: 'text' })
  title: string;

  @Column({ name: 'content', type: 'text', nullable: true })
  content: string | null;

  @Column({ name: 'author', type: 'varchar', length: 100, nullable: true })
  author: string | null;

  @Column({ name: 'html_url', type: 'text', nullable: true })
  htmlUrl: string | null;

  @Column({ name: 'state', type: 'varchar', length: 20, nullable: true })
  state: string | null; // open/closed

  @Column({ name: 'created_at_github', type: 'timestamptz', nullable: true })
  createdAtGithub: Date | null;

  @Column({ name: 'updated_at_github', type: 'timestamptz', nullable: true })
  updatedAtGithub: Date | null;

  @Column({ name: 'closed_at_github', type: 'timestamptz', nullable: true })
  closedAtGithub: Date | null;

  @Column({ name: 'merged_at_github', type: 'timestamptz', nullable: true })
  mergedAtGithub: Date | null;

  @Column({ name: 'changed_files', type: 'int', nullable: true })
  changedFiles: number | null;

  @Column({ name: 'additions', type: 'int', nullable: true })
  additions: number | null;

  @Column({ name: 'deletions', type: 'int', nullable: true })
  deletions: number | null;

  @Column({ name: 'commits', type: 'int', nullable: true })
  commits: number | null;

  @ManyToOne(() => Repository, (r) => (r as any).pullRequests, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'repository_id' })
  repository: Repository;

  @OneToMany(() => PullRequestCommit, (c) => c.pullRequest)
  commitRows: PullRequestCommit[];

  @OneToMany(() => PullRequestFile, (f) => f.pullRequest)
  fileRows: PullRequestFile[];
}
