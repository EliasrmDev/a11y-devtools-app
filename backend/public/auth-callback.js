/**
 * auth-callback.js — served from api.a11y.eliasrm.dev/auth-callback.js
 *
 * Flow:
 *   1. Wait for Clerk JS SDK to load.
 *   2. If user already has a session, get the token and send it to the extension.
 *   3. If not, mount <SignIn /> so the user can authenticate, then send the token.
 */

(function () {
  'use strict';

  // Both prod and dev extension IDs. The message is sent to whichever is installed.
  var EXTENSION_IDS = [
    'idikmoknbihljafgbjbbngnfogbnbjkb', // production
  ];

  var statusEl = document.getElementById('status-msg');

  function setStatus(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
  }

  function sendTokenToExtension(token) {
    setStatus('Connecting to extension…');

    var sent = false;

    EXTENSION_IDS.forEach(function (id) {
      try {
        chrome.runtime.sendMessage(
          id,
          { type: 'LOGIN_BACKEND', token: token },
          function (response) {
            if (chrome.runtime.lastError) {
              return; // Extension not installed with this ID — try next.
            }
            if (!sent) {
              sent = true;
              if (response && response.ok) {
                setStatus('Signed in successfully. You may close this tab.', 'success');
                setTimeout(function () { window.close(); }, 1500);
              } else {
                var msg = (response && response.error) ? response.error : 'Unknown error';
                setStatus('Extension error: ' + msg, 'error');
              }
            }
          }
        );
      } catch (e) {
        setStatus('Cannot communicate with extension. Make sure it is installed.', 'error');
      }
    });

    setTimeout(function () {
      if (!sent) {
        setStatus('Extension not found. Make sure a11y DevTools is installed and enabled.', 'error');
      }
    }, 3000);
  }

  function handleSignedIn(session) {
    setStatus('Getting session token…');
    session
      .getToken()
      .then(function (token) {
        if (!token) {
          setStatus('Could not retrieve session token.', 'error');
          return;
        }
        sendTokenToExtension(token);
      })
      .catch(function (err) {
        setStatus('Token error: ' + (err.message || err), 'error');
      });
  }

  function mountSignIn(clerk) {
    setStatus('Please sign in below.');
    clerk.mountSignIn(document.getElementById('clerk-signin'), {
      afterSignInUrl: window.location.href,
    });

    var pollInterval = setInterval(function () {
      if (clerk.session) {
        clearInterval(pollInterval);
        handleSignedIn(clerk.session);
      }
    }, 500);
  }

  function init() {
    var clerk = window.Clerk;
    if (!clerk) {
      setStatus('Clerk SDK failed to load.', 'error');
      return;
    }

    clerk
      .load()
      .then(function () {
        if (clerk.session) {
          handleSignedIn(clerk.session);
        } else {
          mountSignIn(clerk);
        }
      })
      .catch(function (err) {
        setStatus('Clerk load error: ' + (err.message || err), 'error');
      });
  }

  var clerkScript = document.querySelector('script[data-clerk-publishable-key]');
  if (!clerkScript) {
    setStatus('Clerk script not found.', 'error');
    return;
  }

  if (window.Clerk) {
    init();
  } else {
    clerkScript.addEventListener('load', init);
    clerkScript.addEventListener('error', function () {
      setStatus('Failed to load Clerk JS SDK.', 'error');
    });
  }
})();
