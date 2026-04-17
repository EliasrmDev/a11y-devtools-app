/**
 * auth-callback.js
 *
 * Loaded by auth-callback.html after Clerk JS SDK initialises.
 * Flow:
 *   1. Wait for Clerk to load.
 *   2. If user is already signed in, grab the session token and forward it
 *      to the extension via chrome.runtime.sendMessage (externally_connectable).
 *   3. If not signed in, mount the <SignIn /> component so the user can
 *      authenticate, then forward the token once the session exists.
 */

(function () {
  'use strict';

  // Both prod and dev extension IDs — the message is sent to whichever
  // extension is installed.  A failure for one is silently ignored.
  var EXTENSION_IDS = [
    'idikmoknbihljafgbjbbngnfogbnbjkb', // production
    'lbdlhchbbefkpakkeabdakjohchfailb', // development / unpacked
  ];

  var statusEl = document.getElementById('status-msg');

  function setStatus(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
  }

  /**
   * Send the Clerk session token to the extension(s).
   * Tries each known extension ID; succeeds on the first that responds ok.
   */
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
              // Extension not found with this ID — ignore and try the next one.
              return;
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
        // chrome.runtime.sendMessage throws when called outside an extension
        // context (e.g. plain browser tab without chrome API).
        setStatus('Cannot communicate with extension. Make sure it is installed.', 'error');
      }
    });

    // If neither extension ID is available after a short wait, show guidance.
    setTimeout(function () {
      if (!sent) {
        setStatus('Extension not found. Make sure a11y DevTools is installed and enabled.', 'error');
      }
    }, 3000);
  }

  /**
   * Once the user has an active session, retrieve a short-lived token and
   * forward it to the extension.
   */
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

  /**
   * Mount the Clerk <SignIn /> component and listen for the session to
   * become active.
   */
  function mountSignIn(clerk) {
    setStatus('Please sign in below.');
    clerk.mountSignIn(document.getElementById('clerk-signin'), {
      afterSignInUrl: window.location.href,
    });

    // Poll until a session appears (Clerk fires no reliable postMessage here).
    var pollInterval = setInterval(function () {
      if (clerk.session) {
        clearInterval(pollInterval);
        handleSignedIn(clerk.session);
      }
    }, 500);
  }

  /**
   * Entry point — called once window.__clerk_publishable_key is loaded.
   */
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

  // Clerk SDK sets window.__onClerkReady or just resolves async.
  // The simplest cross-browser way: wait for the script's load event via
  // the script tag that's already in the DOM with data-clerk-publishable-key.
  var clerkScript = document.querySelector('script[data-clerk-publishable-key]');
  if (!clerkScript) {
    setStatus('Clerk script not found.', 'error');
    return;
  }

  // If Clerk is already loaded (script was sync / cached), run immediately.
  if (window.Clerk) {
    init();
  } else {
    clerkScript.addEventListener('load', init);
    clerkScript.addEventListener('error', function () {
      setStatus('Failed to load Clerk JS SDK.', 'error');
    });
  }
})();
