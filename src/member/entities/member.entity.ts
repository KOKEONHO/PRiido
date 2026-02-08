import { Column, Entity, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { GithubAccessToken } from './github-access-token.entity';

@Entity('member')
export class Member {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'github_user_id', type: 'bigint', unique: true })
  githubUserId: string;

  @Column({ name: 'github_username', type: 'varchar', length: 100 })
  githubUsername: string;

  @Column({ name: 'github_avatar_url', type: 'varchar', length: 255 })
  githubAvatarUrl: string;

  @OneToOne(() => GithubAccessToken, (gat) => gat.member)
  githubAccessToken?: GithubAccessToken;
}
