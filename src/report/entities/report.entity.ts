import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('report')
export class Report {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
  id: string;

  @Column({ name: 'member_id', type: 'bigint' })
  memberId: string;

  @Column({ name: 'repository_id', type: 'bigint' })
  repositoryId: string;

  @Column({ name: 'content', type: 'text' })
  content: string;
}
