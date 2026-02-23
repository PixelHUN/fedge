const fs = require('fs');

async function testFetch() {
    const data = JSON.parse(fs.readFileSync('characters.json', 'utf8'));
    let availableCharacters = data.characters || [];

    await Promise.all(availableCharacters.map(async char => {
        if (char.avatarId) {
            try {
                const r = await fetch(`https://e621.net/posts.json?tags=id:${char.avatarId}`);
                console.log(char.id, r.ok, r.status);
                if (r.ok) {
                    const postData = await r.json();
                    if (postData.posts && postData.posts.length > 0) {
                        char.avatarUrl = postData.posts[0].sample?.url || postData.posts[0].file?.url;
                    }
                }
            } catch(e) { console.error("Avatar fetch error", e); }
        }
    }));
    
    console.log(availableCharacters);
}

testFetch();
