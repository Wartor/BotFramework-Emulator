//
// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license.
//
// Microsoft Bot Framework: http://botframework.com
//
// Bot Framework Emulator Github:
// https://github.com/Microsoft/BotFramwork-Emulator
//
// Copyright (c) Microsoft Corporation
// All rights reserved.
//
// MIT License:
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED ""AS IS"", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//

import * as jwt from 'jsonwebtoken';
import * as Restify from 'restify';

import { authentication, v31Authentication, v32Authentication } from '../authEndpoints';
import Bot from '../bot';
import OpenIdMetadata from './openIdMetadata';

export default function createBotFrameworkAuthenticationMiddleware(botId: string, fetch: any) {
  const openIdMetadata = new OpenIdMetadata(fetch, authentication.openIdMetadata);

  return async (req: Restify.Request, res: Restify.Response, next: Restify.Next) => {
    const authorization = req.header('Authorization');    
    if (!authorization)
      return;
      
    const [authMethod, token] = authorization.trim().split(' ');

    // Verify token
    const decoded: any = /^bearer$/i.test(authMethod) && token && jwt.decode(token, { complete: true });

    if (!decoded) {
      // Token not provided so
      res.status(401);
      res.end();

      return;
    }

    const key = await openIdMetadata.getKey(decoded.header.kid);

    if (!key) {
      res.status(500);
      res.end();

      return;
    }

    let issuer;

    if (decoded.payload.ver === '1.0') {
      issuer = v32Authentication.tokenIssuerV1;
    } else if (decoded.payload.ver === '2.0') {
      issuer = v32Authentication.tokenIssuerV2;
    } else {
      // unknown token format
      res.status(401);
      res.end();

      return;
    }

    try {
      // first try 3.2 token characteristics
      jwt.verify(token, key, {
        audience: authentication.botTokenAudience,
        clockTolerance: 300,
        issuer,

        // TODO: "jwtId" is a typo, it should be "jwtid"
        //       But when we enable "jwtid", it will fail the verification
        //       because the payload does not specify "jti"
        //       When we comment out "jwtId", it also works (because it is a typo)

        // jwtId: botId
      });
    } catch (err) {
      try {
        // then try v3.1 token characteristics
        jwt.verify(token, key, {
          audience: authentication.botTokenAudience,
          clockTolerance: 300,
          issuer: v31Authentication.tokenIssuer,

          // TODO: "jwtId" is a typo, it should be "jwtid"
          //       But when we enable "jwtid", it will fail the verification
          //       because the payload does not specify "jti"
          //       When we comment out "jwtId", it also works (because it is a typo)

          // jwtId: botId
        });
      } catch (err) {
        res.status(401);
        res.end();

        return;
      }
    }

    next();
  };
}
