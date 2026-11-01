import { conflict } from '../../utils/http-error.js';
import { isConstraintError, toIsoTimestamp } from '../../utils/sql.js';

export const toUserDto = (row) => ({
  id: row.ID,
  name: row.Name,
  email: row.Email,
  role: row.Role,
  createdAt: toIsoTimestamp(row.CreatedAt),
});

function rethrowEmailTaken(err) {
  if (isConstraintError(err) && err.message.includes('Users.Email')) {
    throw conflict('EMAIL_TAKEN', 'An account with this e-mail already exists');
  }
  throw err;
}

export function createUsersService(db) {
  const selectById = db.prepare('SELECT * FROM Users WHERE ID = ?');
  const selectByEmail = db.prepare('SELECT * FROM Users WHERE Email = ?');
  const insertUser = db.prepare(
    'INSERT INTO Users (Name, Email, PasswordHash, Role) VALUES (?, ?, ?, ?) RETURNING *',
  );
  const updatePasswordHash = db.prepare('UPDATE Users SET PasswordHash = ? WHERE ID = ?');
  const updateRole = db.prepare('UPDATE Users SET Role = ? WHERE ID = ?');

  function findById(id) {
    const row = selectById.get(id);
    return row ? toUserDto(row) : null;
  }

  /** Returns the user together with the password hash, for login only. */
  function findAuthByEmail(email) {
    const row = selectByEmail.get(email);
    return row ? { user: toUserDto(row), passwordHash: row.PasswordHash } : null;
  }

  function getPasswordHash(id) {
    return selectById.get(id)?.PasswordHash ?? null;
  }

  function create({ name, email, passwordHash, role = 'customer' }) {
    try {
      return toUserDto(insertUser.get(name, email, passwordHash, role));
    } catch (err) {
      rethrowEmailTaken(err);
    }
  }

  function updateProfile(id, { name, email }) {
    const changes = Object.entries({ Name: name, Email: email }).filter(([, v]) => v !== undefined);
    if (changes.length > 0) {
      try {
        db.prepare(
          `UPDATE Users SET ${changes.map(([column]) => `${column} = ?`).join(', ')} WHERE ID = ?`,
        ).run(...changes.map(([, value]) => value), id);
      } catch (err) {
        rethrowEmailTaken(err);
      }
    }
    return findById(id);
  }

  function setPasswordHash(id, passwordHash) {
    updatePasswordHash.run(passwordHash, id);
  }

  function setRole(id, role) {
    updateRole.run(role, id);
  }

  return {
    findById,
    findAuthByEmail,
    getPasswordHash,
    create,
    updateProfile,
    setPasswordHash,
    setRole,
  };
}
