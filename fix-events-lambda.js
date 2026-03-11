const { dbConnection } = require('./database');

exports.handler = async (event) => {
    console.log('🔧 URGENT: Fixing event access...');
    
    // Correct event mappings from CSV
    const correctEvents = event.correctEvents || {};
    
    await dbConnection.initialize();
    
    const result = await dbConnection.query('SELECT id, guest_name, token, event_access FROM invitations');
    const guests = result.rows;
    
    let fixed = 0;
    const changes = [];
    
    for (const guest of guests) {
        const nameKey = guest.guest_name.toLowerCase();
        const correct = correctEvents[nameKey];
        
        if (!correct) continue;
        
        const current = guest.event_access || [];
        const needsUpdate = JSON.stringify(current.sort()) !== JSON.stringify(correct.sort());
        
        if (needsUpdate) {
            await dbConnection.query(
                'UPDATE invitations SET event_access = $1 WHERE id = $2',
                [correct, guest.id]
            );
            changes.push({
                name: guest.guest_name,
                token: guest.token,
                from: current,
                to: correct
            });
            fixed++;
        }
    }
    
    await dbConnection.close();
    
    return {
        statusCode: 200,
        body: JSON.stringify({ fixed, changes })
    };
};
