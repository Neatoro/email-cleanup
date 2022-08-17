const { ImapFlow } = require('imapflow');
const pino = require('pino')();
const dotenv = require('dotenv');

dotenv.config();

pino.level = 'silent';
const client = new ImapFlow({
    host: 'imap.gmx.net',
    port: 993,
    secure: true,
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD
    },
    logger: pino
});

async function main() {
    const inquirer = (await import('inquirer')).default;

    const mailsAggregation = {};

    await client.connect();
    
    const lock = await client.getMailboxLock('INBOX');

    try {
        for await (let message of client.fetch('1:*', { envelope: true })) {
            if (message.envelope.from) {
                for (const sender of message.envelope.from) {
                    if (!mailsAggregation[sender.address]) {
                        mailsAggregation[sender.address] = [];
                    }

                    mailsAggregation[sender.address].push(message);
                }
            }
        }

        const senders = Object.keys(mailsAggregation);
        const senderStats = senders.map((sender) => ({ sender, count: mailsAggregation[sender].length})).sort((a, b) => b.count - a.count);
        
        const result = await inquirer.prompt([
            {
                type: 'list',
                name: 'throwaway',
                message: 'Which sender you want to clear?',
                choices: senderStats.map((stats) => ({ value: stats.sender, name: `${stats.sender} - ${stats.count}`})),
                loop: false
            }
        ]);
        
        mailsAggregation[result.throwaway].forEach((message) => console.log(`${message.uid}: ${message.envelope.subject}`));

        const confirm = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: 'Shall I delete all mentioned mails?'
            }
        ]);
        if (confirm.confirm) {
            for (const message of mailsAggregation[result.throwaway]) {
                await client.messageDelete(message.uid, { uid: true });
                console.log('Delete Mail: ', `${message.uid}: ${message.envelope.subject}`)
            }
        }
    } finally {
        lock.release();
    }

    await client.logout();
}

main();