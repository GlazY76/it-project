import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { HttpError, badRequest, conflict } from '../../utils/http-error.js';

export function createAuthService({ usersService, config }) {
  // Compared against when the e-mail is unknown, so that both login failures take the same time
  let dummyHash;

  function issueToken(user) {
    return jwt.sign({ role: user.role }, config.jwt.secret, {
      subject: String(user.id),
      expiresIn: config.jwt.expiresIn,
      algorithm: 'HS256',
    });
  }

  function hashPassword(password) {
    return bcrypt.hash(password, config.bcryptRounds);
  }

  async function register({ name, email, password }) {
    if (usersService.findAuthByEmail(email)) {
      throw conflict('EMAIL_TAKEN', 'An account with this e-mail already exists');
    }
    const user = usersService.create({ name, email, passwordHash: await hashPassword(password) });
    return { user, token: issueToken(user) };
  }

  async function login({ email, password }) {
    const account = usersService.findAuthByEmail(email);
    dummyHash ??= await hashPassword('codeshelf-dummy-password');
    const passwordMatches = await bcrypt.compare(password, account?.passwordHash ?? dummyHash);
    if (!account || !passwordMatches) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid e-mail or password');
    }
    return { user: account.user, token: issueToken(account.user) };
  }

  async function changePassword(userId, { currentPassword, newPassword }) {
    const matches = await bcrypt.compare(currentPassword, usersService.getPasswordHash(userId));
    if (!matches) throw badRequest('INVALID_PASSWORD', 'The current password is incorrect');
    usersService.setPasswordHash(userId, await hashPassword(newPassword));
  }

  return { register, login, changePassword, hashPassword, issueToken };
}
