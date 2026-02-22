const settings = require('../settings');

async function ownerCommand(sock, chatId) {
    const vcard = `
BEGIN:VCARD
VERSION:1.2.2
FN:${settings.botOwner}
TEL;waid=${settings.ownerNumber}:${settings.ownerNumber}
END:VCARD
`;

    await sock.sendMessage(chatId, {
        contacts: { displayName: settings.botOwner, contacts: [{ vcard }] },
    });
}

module.exports = ownerCommand;
