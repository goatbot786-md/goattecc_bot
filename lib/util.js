const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const Jimp = require('jimp');
const FormData = require('form-data');
const yts = require('yt-search');
const cheerio = require('cheerio');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const ffmpeg = require('fluent-ffmpeg');

// FFMPEG setup
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

async function downloadMedia(conn, message, filename, attachExtension = true) {
    try {
        const mime = (message.msg || message).mimetype || '';
        const messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
        
        const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
        const stream = await downloadContentFromMessage(message, messageType);
        
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        
        const FileType = require('file-type');
        const type = await FileType.fromBuffer(buffer);
        const trueFileName = attachExtension ? (filename + '.' + type.ext) : filename;
        
        await fs.writeFileSync(trueFileName, buffer);
        return trueFileName;
    } catch (error) {
        throw new Error(`Failed to download media: ${error.message}`);
    }
}

async function resizeImage(image, width, height) {
    try {
        const imageBuffer = await Jimp.read(image);
        const resizedBuffer = await imageBuffer.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
        return resizedBuffer;
    } catch (error) {
        throw new Error(`Failed to resize image: ${error.message}`);
    }
}

async function searchYouTube(query) {
    try {
        const searchResult = await yts(query);
        return searchResult.videos.slice(0, 10);
    } catch (error) {
        throw new Error(`YouTube search failed: ${error.message}`);
    }
}

async function createSticker(media, packname = 'Mini GOAT TECC', author = 'GOAT TECC') {
    try {
        const sticker = new Sticker(media, {
            pack: packname,
            author: author,
            type: StickerTypes.FULL,
            categories: ['🤩', '🎉'],
            id: '12345',
            quality: 50,
            background: '#00000000'
        });
        
        return await sticker.toMessage();
    } catch (error) {
        throw new Error(`Sticker creation failed: ${error.message}`);
    }
}

async function uploadToCatbox(filePath) {
    try {
        const formData = new FormData();
        formData.append('reqtype', 'fileupload');
        formData.append('fileToUpload', fs.createReadStream(filePath));
        
        const response = await axios.post('https://catbox.moe/user/api.php', formData, {
            headers: formData.getHeaders()
        });
        
        return response.data;
    } catch (error) {
        throw new Error(`Catbox upload failed: ${error.message}`);
    }
}

async function getRandomQuote() {
    try {
        const response = await axios.get('https://api.quotable.io/random');
        return response.data;
    } catch (error) {
        return { content: "The best preparation for tomorrow is doing your best today.", author: "H. Jackson Brown, Jr." };
    }
}

async function scrapeWebsite(url) {
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        return {
            title: $('title').text(),
            description: $('meta[name="description"]').attr('content'),
            h1: $('h1').first().text()
        };
    } catch (error) {
        throw new Error(`Web scraping failed: ${error.message}`);
    }
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

async function convertAudio(inputPath, outputPath, format = 'mp3') {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .toFormat(format)
            .on('end', () => resolve(outputPath))
            .on('error', (err) => reject(err))
            .save(outputPath);
    });
}

module.exports = {
    downloadMedia,
    resizeImage,
    searchYouTube,
    createSticker,
    uploadToCatbox,
    getRandomQuote,
    scrapeWebsite,
    formatBytes,
    convertAudio
};
