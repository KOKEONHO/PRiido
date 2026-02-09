import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { MemberRepository } from './member-repository.entity';

@Entity('repository')
@Unique('uq_repository_github_repo_id', ['githubRepoId'])
@Unique('uq_repository_full_name', ['githubRepoFullName'])
export class Repository {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'github_repo_id', type: 'bigint' })
  githubRepoId!: string;

  @Column({ name: 'github_repo_name', type: 'varchar', length: 200 })
  githubRepoName!: string;

  @Column({ name: 'github_repo_full_name', type: 'varchar', length: 350 })
  githubRepoFullName!: string;

  @Column({ name: 'html_url', type: 'text', nullable: true })
  htmlUrl!: string | null;

  @Column({ name: 'is_private', type: 'boolean', default: false })
  isPrivate!: boolean;

  @Column({
    name: 'last_synced_merged_at',
    type: 'timestamptz',
    nullable: true,
  })
  lastSyncedMergedAt!: Date | null;

  @OneToMany(() => MemberRepository, (mr) => mr.repository)
  memberRepositories!: MemberRepository[];
}
