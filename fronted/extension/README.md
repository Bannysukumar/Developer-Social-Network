# DevConnect for Visual Studio Code

DevConnect for Visual Studio Code is a social networking and messaging extension for developers who want to stay in their editor. You can discover other developers, send and answer friend requests, keep a list of connections, and exchange private messages without opening a separate chat application.

It is for individual developers who want to meet peers, for people exploring a developer community, and for Visual Studio Code users who want that network in the same workspace as their code. An account is required. DevConnect has no public groups, channels, or repository integrations. You choose who to connect with, and you talk with those people one to one.

## What you can do

- **Find people.** Search the developer community and open a profile before you decide to connect.
- **Build a network.** Send a friend request, respond to requests you receive, and keep the people you have accepted in one list.
- **Talk privately.** Open a one-to-one conversation with a connection and send messages while you work.
- **Come back to a conversation.** Saved messages stay available on the device that can open them, with times and date groupings so you can see when a conversation happened.
- **See what is new.** DevConnect can tell you about a message or a friend update when you are not already looking at that conversation.
- **Control your account.** Update your profile, choose a public or private account, and block someone you do not want to hear from.

## Developer discovery and networking

Search is the starting point for developer discovery. From Search, look up another person, open their profile, and decide whether to send a friend request. A profile shows the name and username they chose. If their account is public, you can also read the bio they have written. A private account keeps that extra detail hidden until you are connected.

A request you send waits with your outgoing requests until the other person accepts or declines it. Requests that other people send you appear with your incoming requests, where you can accept or decline them. Accepted connections appear in Friends. From there you can open a conversation or remove a connection when you no longer want it.

Someone has to accept your request before that person appears in Friends and you can message them as a connection. Use Search when you know who you are looking for, use incoming requests when someone has asked to connect with you, and use Friends when you want to maintain the list.

## Private messaging and conversation history

Private developer messaging in DevConnect is one conversation between you and one connection. Open Messages, choose a person, and type in the composer. Messages you send and messages you receive appear in the same thread, with the time on each message. The thread also groups messages by day, so a conversation that continues across today, yesterday, or an older date is easier to scan.

When a conversation has more saved messages than the first screen, DevConnect opens on the newest messages. Earlier messages load as you scroll up, so a long history does not have to arrive all at once. A message that arrives while you have the conversation open is added to that thread. If you are looking at a different part of DevConnect, the new message can raise a notice instead of interrupting the chat you already have on screen.

A message can show a delivery or read mark when that status is available. You can also attach a file or an image. The thread is still a conversation, not a shared document or a code review.

### Reading older messages on this installation

Message content is encrypted on your device before it is sent. The service stores that encrypted message so the conversation can be opened again later. On the installation that created the device key, you can read the messages that key can open, including messages from earlier days.

### Reading messages after a reinstall or on another computer

A new installation does not automatically have the key from the previous one. History can still be downloaded, but the text stays unreadable until that key is restored.

Before you reset a computer, reinstall DevConnect, or sign in on another machine, open Settings, then Security, and save a recovery passphrase. Keep that passphrase somewhere outside the computer. On the new installation, sign in, open Settings, then Security, enter the same passphrase, and restore the device.

If no passphrase was saved before the old installation was removed, those older messages cannot be opened. A forgotten passphrase cannot be reset, and DevConnect cannot reconstruct the missing key. New messages sent from the new installation can be read there. They do not unlock messages sealed to a key you no longer have. Message history is not automatically readable on every new device.

## Notifications and staying connected

DevConnect can notify you about activity that needs your attention while you are using Visual Studio Code.

While Visual Studio Code is open and in front, a relevant message or friend update can appear as a notice in the editor. The conversation you are already reading stays quiet, so you are not notified about the thread on your screen. You can open the Notifications area to review what arrived and catch up on friend requests or messages you have not opened yet.

On Windows, a desktop notification can also appear when Visual Studio Code is open but another application is in front. That desktop notice is a Windows feature. Other operating systems keep the in-editor notice and do not show the Windows desktop notification. Desktop notifications also are not sent when Visual Studio Code is completely closed, because the extension is not running then. Operating-system focus settings, Do Not Disturb, and notification permissions can still hide a notice even when DevConnect tries to show one.

Notification preferences let you turn message, friend-request, and friend-accepted notices on or off. Turning a notice off does not delete the friend request or the saved message.

## Profiles, accounts, and privacy controls

Create an account from the sign-in screen, or sign in if you already have one. After you are signed in, Profile is where you review the name, username, and bio that other people can see. You can update those details when you want the profile to reflect how you introduce yourself.

Account privacy is a choice between a public and a private profile. A public profile can show your bio to someone who finds you in search. A private profile asks them to connect before that extra detail is visible. The username you are known by is still how people find and recognize the account.

Blocking is the control for someone you do not want contact with. Block them from their profile. They are listed under Settings, then Privacy, where you can unblock them later. A blocked conversation cannot be used to exchange messages: you will see that you blocked them, and you can unblock them if you change your mind. If someone has blocked you, that conversation is unavailable and you cannot message them. Blocking is not a mute for a public group, because DevConnect does not have public groups. It applies to the direct relationship with that person.

Security settings are also where the recovery passphrase lives. Saving one is optional, and it is separate from your account password. Your account password signs you in. The recovery passphrase is only for restoring the key that opens older messages.

## Privacy and security

DevConnect is designed so that private messages are protected in transit and at rest as encrypted content.

- Signing in uses your account. A person who does not have the account cannot open your conversations through the extension.
- Message content is encrypted on your device before it is sent. The service stores the encrypted message rather than the readable text.
- Your signed-in session is kept by Visual Studio Code for this extension, so you can reopen DevConnect without typing your password every time the editor starts.
- The connection to the DevConnect service is a secure connection.

These protections have limits. A new device cannot read old messages unless you restore a recovery passphrase that was saved earlier. A lost passphrase cannot be recovered. Anyone who can use your unlocked editor can see a conversation that this installation has already opened.

DevConnect is not anonymous. Your profile, username, friendships, and the existence of a conversation are part of the network. A public profile can be found in search. Blocking and a private account are the controls inside the product. They do not mean the service stores nothing, and they do not hide a message from someone who has the key for it.

## Getting started

1. Install DevConnect for Visual Studio Code from the Visual Studio Marketplace.
2. Open DevConnect from the Activity Bar in Visual Studio Code.
3. Create an account, or sign in with the account you already have.
4. Search for developers, send a request, and respond to requests you receive.
5. Open a conversation with a connection and send a message.

You need an account before Home, Search, Friends, Messages, Notifications, Profile, or Settings will open. Signing out returns you to the sign-in screen. Saved conversations remain on the service. If you plan to reinstall DevConnect or use another computer, save a recovery passphrase on this installation first, and restore it on the next one before you expect older threads to be readable.

## Example workflows

### Find a developer and connect

Open Search and look up a person by name or username. Read the profile they have chosen to show. A private account keeps the extra detail hidden until you connect. Send a friend request and follow it under outgoing requests until they accept.

### Answer a request and start a conversation

Open Friends and review incoming requests. Accept someone to add them to your connections, or decline the request. From the friend list, choose Message, write a note, and send it. The thread shows that message with the time.

### Return to an earlier conversation

Open Messages and select the person. The newest messages appear first. Scroll up for older ones. Days are separated, so a message from today is distinct from one from an earlier date. If the text says it is sealed to another installation, restore a recovery passphrase if you saved one. Otherwise that message stays unreadable on this device.

### Catch up on notifications

Open Notifications when a notice appears while you are elsewhere in Visual Studio Code. Review the message or friend activity, then open the related conversation or request. The conversation already on screen does not raise its own notice. On Windows, a desktop notice can be the cue when Visual Studio Code is open but not the active window.

### Update your profile, or block someone

Open Profile to change your display name or bio, and to choose a public or private account. Block someone from their profile when you want the conversation to stop. Unblock them later from Settings, then Privacy. Use Settings, then Notifications, to choose which activities raise a notice, and Settings, then Security, to save or restore a recovery passphrase. Privacy and notification settings do not restore a missing message key.

## Frequently asked questions

### What is DevConnect for Visual Studio Code?

It is a developer networking extension and a developer chat extension for VS Code. You discover people, manage friendships, and exchange private messages from the Activity Bar.

### Is DevConnect a social networking extension for developers?

Yes. It covers developer discovery, friend requests, a friend list, profiles, and one-to-one conversations. It is not a public forum, a team chat with channels, or a coding-collaboration product.

### Can I chat with other developers inside VS Code?

Yes. After you are connected, open Messages and start a conversation. New messages can arrive while DevConnect is running. You both need accounts, and the other person needs to be available to receive a message on their installation.

### Can I view previous conversations?

Yes, on an installation that can open them. Choose the conversation and read the saved thread. The newest messages are shown first, and older ones load as you scroll up. A new computer can show the saved thread as unreadable until you restore a recovery passphrase that was saved earlier.

### Does DevConnect support real-time chat in VS Code?

Messages are delivered while both people are using DevConnect and Visual Studio Code is running. You do not need to refresh the conversation by hand to see a message that arrives in an open thread. Real-time delivery does not continue after you quit Visual Studio Code.

### Does DevConnect support notifications?

Yes. Visual Studio Code can show a notice for a message or friend activity when you are not already in that conversation. On Windows, a desktop notification can appear when the editor is open but not the active window. Notices are not delivered when Visual Studio Code is fully closed, and the Windows desktop notification is not the behavior on other operating systems.

### Do I need an account to use DevConnect?

Yes. Create an account or sign in before you can search, manage friends, or send messages.

### How do I recover messages after reinstalling the extension?

You can recover readable text only if you saved a recovery passphrase on the previous installation. On the new installation, sign in, open Settings, then Security, enter that passphrase, and restore the device. If you never saved one, the encrypted history can still be listed, but this installation cannot turn it back into the original text.

### Can I access old encrypted messages from a new computer?

Only with the recovery passphrase from the installation that sealed them. Signing in with your account password is not enough. A forgotten passphrase cannot be reset, and there is no other key that DevConnect can send you by email.

### Where can I find DevConnect in VS Code?

Install it from the Visual Studio Marketplace, then open the DevConnect icon on the Activity Bar. From there you can move among Home, Search, Friends, Messages, Notifications, Profile, and Settings.

### Will blocking someone delete the old messages?

Blocking stops the conversation from being used. You can unblock later from Settings, then Privacy. Blocking is not a replacement for the recovery passphrase, and it is not described here as a way to erase history from the service.

### Can I use DevConnect to collaborate on a repository?

No. DevConnect is for developer discovery, friendships, and private messaging. It does not review pull requests, share an editor session, or connect to a source-control host.

## Try it from the editor

Install DevConnect, create an account, and open it from the Activity Bar. Search for a developer, accept a request, and send a message without leaving the workspace. Save a recovery passphrase before you reinstall or switch computers if you want older messages to stay readable.
