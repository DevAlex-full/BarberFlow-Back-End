import passport from 'passport';
import { 
  Strategy as GoogleStrategy, 
  Profile as GoogleProfile,
  VerifyCallback 
} from 'passport-google-oauth20';
import { 
  Strategy as FacebookStrategy, 
  Profile as FacebookProfile 
} from 'passport-facebook';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ===========================
// GOOGLE OAUTH STRATEGY (CONDICIONAL)
// ===========================
const GOOGLE_CONFIG = {
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
};

// ✅ Só registra se TODAS as credenciais existirem
if (GOOGLE_CONFIG.clientID && GOOGLE_CONFIG.clientSecret && GOOGLE_CONFIG.callbackURL) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CONFIG.clientID,
        clientSecret: GOOGLE_CONFIG.clientSecret,
        callbackURL: GOOGLE_CONFIG.callbackURL,
      },
      async (
        _accessToken: string,
        _refreshToken: string,
        profile: GoogleProfile,
        done: VerifyCallback
      ) => {
        try {
          const email = profile.emails?.[0]?.value;

          if (!email) {
            console.warn('⚠️ Google OAuth: Email não fornecido');
            return done(new Error('Email não fornecido pelo Google'), undefined);
          }

          let client = await prisma.client.findUnique({
            where: { email },
          });

          if (!client) {
            console.log(`✅ Criando novo cliente via Google: ${email}`);
            client = await prisma.client.create({
              data: {
                email: email,
                name: profile.displayName || 'Usuário Google',
                phone: '',
                password: '',
                googleId: profile.id,
              },
            });
          } else if (!client.googleId) {
            console.log(`🔗 Vinculando Google ID ao cliente: ${email}`);
            client = await prisma.client.update({
              where: { id: client.id },
              data: { 
                googleId: profile.id 
              },
            });
          }

          return done(null, client);
        } catch (error) {
          console.error('❌ Erro no Google OAuth:', error);
          return done(error as Error, undefined);
        }
      }
    )
  );
  console.log('✅ Google OAuth habilitado');
} else {
  console.warn('⚠️  Google OAuth desabilitado (credenciais ausentes ou incompletas)');
}

// ===========================
// FACEBOOK OAUTH STRATEGY (CONDICIONAL)
// ===========================
const FACEBOOK_CONFIG = {
  clientID: process.env.FACEBOOK_APP_ID,
  clientSecret: process.env.FACEBOOK_APP_SECRET,
  callbackURL: process.env.FACEBOOK_CALLBACK_URL,
};

// ✅ Só registra se TODAS as credenciais existirem
if (FACEBOOK_CONFIG.clientID && FACEBOOK_CONFIG.clientSecret && FACEBOOK_CONFIG.callbackURL) {
  passport.use(
    new FacebookStrategy(
      {
        clientID: FACEBOOK_CONFIG.clientID,
        clientSecret: FACEBOOK_CONFIG.clientSecret,
        callbackURL: FACEBOOK_CONFIG.callbackURL,
        profileFields: ['id', 'emails', 'name', 'displayName'],
      },
      async (
        _accessToken: string,
        _refreshToken: string,
        profile: FacebookProfile,
        done: VerifyCallback
      ) => {
        try {
          const email = profile.emails?.[0]?.value;
          
          if (!email) {
            console.warn('⚠️ Facebook OAuth: Email não fornecido');
            return done(
              new Error('Email não fornecido pelo Facebook'),
              undefined
            );
          }

          const name =
            profile.displayName ||
            `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim() ||
            'Usuário Facebook';

          let client = await prisma.client.findUnique({
            where: { email },
          });

          if (!client) {
            console.log(`✅ Criando novo cliente via Facebook: ${email}`);
            client = await prisma.client.create({
              data: {
                email: email,
                name: name,
                phone: '',
                password: '',
                facebookId: profile.id,
              },
            });
          } else if (!client.facebookId) {
            console.log(`🔗 Vinculando Facebook ID ao cliente: ${email}`);
            client = await prisma.client.update({
              where: { id: client.id },
              data: { 
                facebookId: profile.id 
              },
            });
          }

          return done(null, client);
        } catch (error) {
          console.error('❌ Erro no Facebook OAuth:', error);
          return done(error as Error, undefined);
        }
      }
    )
  );
  console.log('✅ Facebook OAuth habilitado');
} else {
  console.warn('⚠️  Facebook OAuth desabilitado (credenciais ausentes ou incompletas)');
}

export default passport