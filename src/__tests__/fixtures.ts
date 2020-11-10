export const schemaUpQuery = `
  CREATE TABLE "user" (
    user_id text NOT NULL PRIMARY KEY,
    user_name text NOT NULL UNIQUE
  );

  CREATE TABLE "user_activity" (
    user_id text NOT NULL REFERENCES "user" (user_id),
    activity_id text NOT NULL,
    PRIMARY KEY (user_id, activity_id)
  );
`;

export const schemaDownQuery = `
  DROP TABLE IF EXISTS "user_activity";
  DROP TABLE IF EXISTS "user";
`;

export const dataQuery = `
  INSERT INTO "user" (user_id, user_name)
    VALUES ('id_user_a', 'User A'), ('id_user_b', 'User B');

  INSERT INTO "user_activity" (user_id, activity_id)
    VALUES ('id_user_b', 'activity_user_b');
`;

export const selectUserActivityJoinQuery = `
  SELECT
    u.user_id as user_id,
    u.user_name as user_name,
    ua.activity_id as activity_id
  FROM "user_activity" ua
   LEFT JOIN "user" u ON (u.user_id = ua.user_id)
`;

export const selectUsersQuery = `
  SELECT user_id, user_name FROM "user";
`;
