import mysql from 'mysql2/promise';
import type { EnvConfig } from '../types.js';

const LATEST_APPLICATION_FOR_PROVIDER = `
SELECT
  SJA.ID AS seeker_job_applicant_id,
  SJA.SEEKER_JOB_ID AS seeker_job_id,
  COALESCE(SJA.WHEN_APPLIED, SJA.WHEN_CREATED, SJA.TLM) AS applied_at,
  SJ.MEMBER_ID AS seeker_member_id,
  TRIM(seeker_auth.USERNAME) AS seeker_email,
  BIN_TO_UUID(seeker_auth.USER_UUID) AS seeker_uuid
FROM MEMBER provider_m
JOIN AUTHENTICATION provider_a ON provider_a.ID = provider_m.AUTHENTICATION_ID
JOIN SEEKER_JOB_APPLICANT SJA ON SJA.APPLICANT_ID = provider_m.ID
JOIN SEEKER_JOB SJ ON SJ.ID = SJA.SEEKER_JOB_ID
JOIN MEMBER seeker_m ON seeker_m.ID = SJ.MEMBER_ID
JOIN AUTHENTICATION seeker_auth ON seeker_auth.ID = seeker_m.AUTHENTICATION_ID
WHERE LOWER(TRIM(provider_a.USERNAME)) = LOWER(TRIM(?))
ORDER BY COALESCE(SJA.WHEN_APPLIED, SJA.WHEN_CREATED, SJA.TLM) DESC
LIMIT 1
`;

export interface SeekerFromLatestApplicationRow {
  seekerEmail: string;
  seekerMemberId: string;
  seekerUuid: string;
  appliedAt: string | null;
  seekerJobApplicantId: number;
  seekerJobId: number;
}

/**
 * For a provider login email, returns the seeker (job poster) for their most recent
 * {@code SEEKER_JOB_APPLICANT} row, ordered by application time.
 */
export async function findSeekerFromLatestProviderApplication(
  providerEmail: string,
  envConfig: EnvConfig
): Promise<SeekerFromLatestApplicationRow | null> {
  if (!envConfig.db.password) {
    throw new Error(
      'MySQL password not set. Set MYSQL_DB_PASS_DEV or MYSQL_DB_PASS_STG for this environment.'
    );
  }

  const connection = await mysql.createConnection({
    host: envConfig.db.host,
    user: envConfig.db.user,
    password: envConfig.db.password,
    database: envConfig.db.database,
  });

  try {
    const [rows] = await connection.execute(LATEST_APPLICATION_FOR_PROVIDER, [providerEmail.trim()]);
    const row = (rows as Record<string, unknown>[])[0];
    if (!row) {
      return null;
    }
    return {
      seekerJobApplicantId: Number(row.seeker_job_applicant_id),
      seekerJobId: Number(row.seeker_job_id),
      appliedAt: row.applied_at ? String(row.applied_at) : null,
      seekerMemberId: String(row.seeker_member_id),
      seekerEmail: String(row.seeker_email),
      seekerUuid: String(row.seeker_uuid),
    };
  } finally {
    await connection.end();
  }
}
