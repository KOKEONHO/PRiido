import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Repository } from './repository.entity';

@Entity('member_repository')
export class MemberRepository {
  @PrimaryColumn({ name: 'member_id', type: 'bigint' })
  memberId!: string;

  @PrimaryColumn({ name: 'repository_id', type: 'bigint' })
  repositoryId!: string;

  @ManyToOne(() => Repository, (r) => r.memberRepositories, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'repository_id' })
  repository!: Repository;
}
