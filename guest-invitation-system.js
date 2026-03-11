#!/usr/bin/env node

const crypto = require('crypto');
const readline = require('readline');
const { dbConnection, guestDB } = require('./database');
const { AWSEmailService, AWSSMSService } = require('./aws-services');
const WhatsAppService = require('./whatsapp-service');
require('dotenv').config();

class WeddingInvitationSystem {
    constructor() {
        this.guests = [];
        this.usedCodes = new Set();
        this.dbInitialized = false;
        
        // Initialize AWS services
        this.emailService = new AWSEmailService();
        this.smsService = new AWSSMSService();
        this.whatsappService = new WhatsAppService();
        
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    // Generate a unique, memorable access code
    generateAccessCode(guestName) {
        let code;
        let attempts = 0;
        
        do {
            // Create a readable code: 2 letters + 4 numbers
            const letters = this.getInitials(guestName);
            const numbers = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            code = letters + numbers;
            attempts++;
        } while (this.usedCodes.has(code) && attempts < 100);
        
        this.usedCodes.add(code);
        return code;
    }

    // Extract initials from guest name
    getInitials(name) {
        const words = name.split(' ').filter(word => word.length > 0);
        if (words.length >= 2) {
            return (words[0][0] + words[words.length - 1][0]).toUpperCase();
        } else if (words.length === 1) {
            return (words[0][0] + words[0][1] || 'X').toUpperCase();
        }
        return 'WD'; // Wedding default
    }

    // Generate device fingerprint for anti-sharing protection
    generateDeviceFingerprint() {
        return crypto.randomBytes(16).toString('hex');
    }

    // Prompt for guest information
    async promptGuestInfo() {
        return new Promise((resolve) => {
            console.log('\n📝 Enter Guest Information:');
            console.log('─'.repeat(40));
            
            const guest = {};
            
            this.rl.question('Guest Name (e.g., "John & Jane Smith"): ', (name) => {
                guest.name = name.trim();
                
                this.rl.question('Email Address: ', (email) => {
                    guest.email = email.trim();
                    
                    this.rl.question('Phone Number (with country code, e.g., +1234567890): ', (phone) => {
                        guest.phone = phone.trim();
                        
                        this.rl.question('Guest Type (family/friend/colleague) [friend]: ', (type) => {
                            guest.type = type.trim() || 'friend';
                            
                            this.rl.question('Max Guests Allowed [2]: ', (maxGuests) => {
                                guest.maxGuests = parseInt(maxGuests) || 2;
                                
                                // Generate unique access code and device fingerprint
                                guest.accessCode = this.generateAccessCode(guest.name);
                                guest.deviceFingerprint = this.generateDeviceFingerprint();
                                guest.createdAt = new Date().toISOString();
                                guest.permissions = guest.type === 'family' ? ['guest', 'family'] : ['guest'];
                                
                                resolve(guest);
                            });
                        });
                    });
                });
            });
        });
    }

    // Create personalized invitation email
    createInvitationEmail(guest) {
        const websiteUrl = 'https://www.yourdomain.com';
        
        return {
            from: this.emailConfig.auth.user,
            to: guest.email,
            subject: '💕 Invitation to the Wedding of {{Bride}} & {{Groom}} 💍',
            html: `
                <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); padding: 20px;">
                    <div style="background: white; padding: 30px; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <h1 style="color: #d4a574; font-size: 2.5em; margin: 0; text-shadow: 2px 2px 4px rgba(0,0,0,0.1);">
                                💕 You're Invited to the Wedding of 💕
                            </h1>
                            <h2 style="color: #333; font-size: 1.8em; margin: 10px 0;">
                                {{Bride}} &amp; {{Groom}}
                            </h2>
                            <p style="color: #666; font-size: 1.1em; margin: 0;">
                                We can't wait to celebrate with you!
                            </p>
                        </div>
                        
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 5px solid #d4a574;">
                            <h3 style="color: #333; margin-top: 0;">Dear ${guest.name},</h3>
                            <p style="color: #555; line-height: 1.6;">
                                You're warmly invited to celebrate the wedding of <strong>{{Bride}} &amp; {{Groom}}</strong>!
                                Visit our wedding website for details, RSVP, and more.
                            </p>
                        </div>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <div style="background: #d4a574; color: white; padding: 20px; border-radius: 10px; margin: 20px 0;">
                                <h3 style="margin: 0 0 10px 0;">🌐 Visit Our Wedding Website</h3>
                                <p style="margin: 0 0 15px 0; font-size: 1.1em;">
                                    <a href="${websiteUrl}" style="color: white; text-decoration: none; font-weight: bold;">
                                        ${websiteUrl}
                                    </a>
                                </p>
                                <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 8px;">
                                    <p style="margin: 0 0 10px 0; font-size: 0.9em;">Your Personal Access Code:</p>
                                    <div style="font-size: 2em; font-weight: bold; letter-spacing: 3px; font-family: 'Courier New', monospace;">
                                        ${guest.accessCode}
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div style="background: #e8f4f8; padding: 20px; border-radius: 10px; margin: 20px 0;">
                            <h4 style="color: #333; margin-top: 0;">📱 How to Access:</h4>
                            <ol style="color: #555; line-height: 1.6;">
                                <li>Click the website link above</li>
                                <li>When prompted, enter your access code: <strong>${guest.accessCode}</strong></li>
                                <li>Explore our wedding details and RSVP</li>
                            </ol>
                            <p style="color: #666; font-size: 0.9em; margin: 15px 0 0 0;">
                                <strong>Important:</strong> This access code is unique to you and should not be shared. 
                                It will only work from your devices for security reasons.
                            </p>
                        </div>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <p style="color: #555; font-size: 1.1em; margin: 0;">
                                We can't wait to celebrate with you! ❤️
                            </p>
                            <p style="color: #d4a574; font-size: 1.3em; font-weight: bold; margin: 10px 0;">
                                {{Bride}} & {{Groom}}
                            </p>
                        </div>
                        
                        <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px; text-align: center;">
                            <p style="color: #999; font-size: 0.8em; margin: 0;">
                                Need help? Contact us at: your-email@example.com
                            </p>
                        </div>
                    </div>
                </div>
            `
        };
    }

    // Create SMS invitation
    createInvitationSMS(guest) {
        const websiteUrl = 'https://www.yourdomain.com';
        
        return `💕 {{Bride}} & {{Groom}}'s Wedding

Hi ${guest.name}! You're invited to our special day!

🌐 Visit: ${websiteUrl}
🔑 Access Code: ${guest.accessCode}

Enter your code when prompted to view all wedding details and RSVP.

❤️ {{Bride}} & {{Groom}}

(This code is unique to you - please don't share)`;
    }

    // Send email invitation using AWS SES
    async sendEmailInvitation(guest) {
        try {
            const result = await this.emailService.sendInvitationEmail(guest);
            return result;
        } catch (error) {
            console.error(`❌ Failed to send email to ${guest.email}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    // Send SMS invitation using AWS SNS
    async sendSMSInvitation(guest) {
        try {
            const result = await this.smsService.sendInvitationSMS(guest);
            return result;
        } catch (error) {
            console.error(`❌ Failed to send SMS to ${guest.phone}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    // Send WhatsApp invitation using Twilio
    async sendWhatsAppInvitation(guest) {
        try {
            const result = await this.whatsappService.sendWeddingInvitation(guest);
            return result;
        } catch (error) {
            console.error(`❌ Failed to send WhatsApp to ${guest.phone}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    // Save guest to RDS database
    async saveGuestToDatabase(guest) {
        try {
            // Ensure database is initialized
            if (!this.dbInitialized) {
                console.log('🔄 Initializing database connection...');
                const connected = await dbConnection.initialize();
                if (!connected) {
                    throw new Error('Failed to connect to RDS database');
                }
                
                // Initialize tables if needed
                await guestDB.initializeTables();
                this.dbInitialized = true;
            }

            // Save guest to RDS database
            const result = await guestDB.createGuest(guest);
            
            if (result.success) {
                console.log('✅ Guest saved to RDS database successfully');
                
                // Add to local array for menu operations
                this.guests.push(guest);
                
                // Also save to local file as backup
                const fs = require('fs');
                try {
                    fs.writeFileSync('wedding-guests.json', JSON.stringify(this.guests, null, 2));
                    console.log('💾 Backup saved to wedding-guests.json');
                } catch (error) {
                    console.warn('⚠️ Failed to save local backup:', error.message);
                }
                
                return { success: true, guest: result.guest };
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('❌ Failed to save guest to database:', error.message);
            
            // Fallback to local storage if database fails
            console.log('🔄 Falling back to local storage...');
            this.guests.push(guest);
            
            const fs = require('fs');
            try {
                fs.writeFileSync('wedding-guests.json', JSON.stringify(this.guests, null, 2));
                console.log('💾 Guest data saved to local file as fallback');
            } catch (fileError) {
                console.error('❌ Failed to save to local file:', fileError.message);
            }
            
            return { success: false, error: error.message };
        }
    }

    // Main process to add a guest
    async addGuest() {
        try {
            console.log('\n🎉 Wedding Invitation System');
            console.log('═'.repeat(50));
            
            // Get guest information
            const guest = await this.promptGuestInfo();
            
            console.log('\n📋 Guest Information Summary:');
            console.log('─'.repeat(40));
            console.log(`Name: ${guest.name}`);
            console.log(`Email: ${guest.email}`);
            console.log(`Phone: ${guest.phone}`);
            console.log(`Type: ${guest.type}`);
            console.log(`Max Guests: ${guest.maxGuests}`);
            console.log(`Access Code: ${guest.accessCode}`);
            console.log(`Permissions: ${guest.permissions.join(', ')}`);
            
            // Confirm before sending
            const confirm = await this.askQuestion('\n✅ Send invitations now? (y/n): ');
            
            if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
                console.log('\n📤 Sending invitations...');
                
                // Send email
                const emailResult = await this.sendEmailInvitation(guest);
                
                // Send WhatsApp
                const whatsappResult = await this.sendWhatsAppInvitation(guest);
                
                // Save to database
                await this.saveGuestToDatabase(guest);
                
                console.log('\n🎊 Invitation Process Complete!');
                console.log('─'.repeat(40));
                console.log(`Guest: ${guest.name}`);
                console.log(`Access Code: ${guest.accessCode}`);
                console.log(`Email: ${emailResult.success ? '✅ Sent' : '❌ Failed'}`);
                console.log(`WhatsApp: ${whatsappResult.success ? '✅ Sent' : '❌ Failed'}`);
                
            } else {
                console.log('\n❌ Invitations not sent. Guest information saved for later.');
                await this.saveGuestToDatabase(guest);
            }
            
        } catch (error) {
            console.error('❌ Error adding guest:', error.message);
        }
    }

    // Helper method for asking questions
    async askQuestion(question) {
        return new Promise((resolve) => {
            this.rl.question(question, (answer) => {
                resolve(answer.trim());
            });
        });
    }

    // Main menu
    async showMenu() {
        console.log('\n🎉 Wedding Invitation System');
        console.log('═'.repeat(50));
        console.log('1. Add New Guest');
        console.log('2. View All Guests');
        console.log('3. Resend Invitation');
        console.log('4. Send WhatsApp Invitations');
        console.log('5. Delete Guest');
        console.log('6. Clear All Guests');
        console.log('7. Exit');
        console.log('─'.repeat(50));
        
        const choice = await this.askQuestion('Choose an option (1-7): ');
        
        switch (choice) {
            case '1':
                await this.addGuest();
                await this.showMenu();
                break;
            case '2':
                this.viewAllGuests();
                await this.showMenu();
                break;
            case '3':
                await this.resendInvitation();
                await this.showMenu();
                break;
            case '4':
                await this.sendWhatsAppInvitations();
                await this.showMenu();
                break;
            case '5':
                await this.deleteGuest();
                await this.showMenu();
                break;
            case '6':
                await this.clearAllGuests();
                await this.showMenu();
                break;
            case '7':
                console.log('\n👋 Goodbye! Have a wonderful wedding! 💕');
                this.rl.close();
                break;
            default:
                console.log('❌ Invalid option. Please try again.');
                await this.showMenu();
        }
    }

    // View all guests
    viewAllGuests() {
        console.log('\n👥 All Guests:');
        console.log('═'.repeat(80));
        
        if (this.guests.length === 0) {
            console.log('No guests added yet.');
            return;
        }
        
        this.guests.forEach((guest, index) => {
            console.log(`${index + 1}. ${guest.name}`);
            console.log(`   Email: ${guest.email}`);
            console.log(`   Phone: ${guest.phone}`);
            console.log(`   Access Code: ${guest.accessCode}`);
            console.log(`   Type: ${guest.type} | Max Guests: ${guest.maxGuests}`);
            console.log(`   Added: ${new Date(guest.createdAt).toLocaleDateString()}`);
            console.log('─'.repeat(60));
        });
    }

    // Resend invitation
    async resendInvitation() {
        if (this.guests.length === 0) {
            console.log('❌ No guests found. Add guests first.');
            return;
        }
        
        console.log('\n📤 Resend Invitation:');
        this.viewAllGuests();
        
        const guestIndex = await this.askQuestion('Enter guest number to resend invitation: ');
        const index = parseInt(guestIndex) - 1;
        
        if (index >= 0 && index < this.guests.length) {
            const guest = this.guests[index];
            console.log(`\n📤 Resending invitation to ${guest.name}...`);
            
            const emailResult = await this.sendEmailInvitation(guest);
            const whatsappResult = await this.sendWhatsAppInvitation(guest);
            
            console.log(`Email: ${emailResult.success ? '✅ Sent' : '❌ Failed'}`);
            console.log(`WhatsApp: ${whatsappResult.success ? '✅ Sent' : '❌ Failed'}`);
        } else {
            console.log('❌ Invalid guest number.');
        }
    }

    // Send WhatsApp invitations
    async sendWhatsAppInvitations() {
        if (this.guests.length === 0) {
            console.log('❌ No guests found. Add guests first.');
            return;
        }
        
        console.log('\n💬 Send WhatsApp Invitations');
        console.log('═'.repeat(50));
        console.log('Choose an option:');
        console.log('1. Send to specific guest');
        console.log('2. Send to all guests');
        console.log('3. Send to international guests only');
        console.log('4. Back to main menu');
        
        const choice = await this.askQuestion('Choose option (1-4): ');
        
        switch (choice) {
            case '1':
                await this.sendWhatsAppToSpecificGuest();
                break;
            case '2':
                await this.sendWhatsAppToAllGuests();
                break;
            case '3':
                await this.sendWhatsAppToInternationalGuests();
                break;
            case '4':
                return;
            default:
                console.log('❌ Invalid option.');
        }
    }

    // Send WhatsApp to specific guest
    async sendWhatsAppToSpecificGuest() {
        console.log('\n📱 Send WhatsApp to Specific Guest:');
        this.viewAllGuests();
        
        const guestIndex = await this.askQuestion('Enter guest number: ');
        const index = parseInt(guestIndex) - 1;
        
        if (index >= 0 && index < this.guests.length) {
            const guest = this.guests[index];
            console.log(`\n💬 Sending WhatsApp to ${guest.name} (${guest.phone})...`);
            
            const result = await this.whatsappService.sendWeddingInvitation(guest);
            
            if (result.success) {
                console.log('✅ WhatsApp sent successfully!');
                console.log(`   Message ID: ${result.messageId}`);
            } else {
                console.log('❌ Failed to send WhatsApp:', result.error);
            }
        } else {
            console.log('❌ Invalid guest number.');
        }
    }

    // Send WhatsApp to all guests
    async sendWhatsAppToAllGuests() {
        console.log(`\n💬 Sending WhatsApp to all ${this.guests.length} guests...`);
        console.log('═'.repeat(50));
        
        let successCount = 0;
        let failCount = 0;
        
        for (let i = 0; i < this.guests.length; i++) {
            const guest = this.guests[i];
            console.log(`📱 Sending to ${guest.name} (${i + 1}/${this.guests.length})...`);
            
            const result = await this.whatsappService.sendWeddingInvitation(guest);
            
            if (result.success) {
                console.log(`   ✅ Sent (ID: ${result.messageId})`);
                successCount++;
            } else {
                console.log(`   ❌ Failed: ${result.error}`);
                failCount++;
            }
            
            // Small delay between messages to avoid rate limiting
            if (i < this.guests.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        console.log('\n🎊 WhatsApp Bulk Send Complete!');
        console.log('─'.repeat(40));
        console.log(`✅ Successful: ${successCount}`);
        console.log(`❌ Failed: ${failCount}`);
        console.log(`📊 Total: ${this.guests.length}`);
    }

    // Send WhatsApp to international guests only
    async sendWhatsAppToInternationalGuests() {
        // Filter international guests (non-US phone numbers)
        const internationalGuests = this.guests.filter(guest => 
            !guest.phone.startsWith('+1') && !guest.phone.startsWith('1')
        );
        
        if (internationalGuests.length === 0) {
            console.log('❌ No international guests found.');
            return;
        }
        
        console.log(`\n🌍 Sending WhatsApp to ${internationalGuests.length} international guests...`);
        console.log('═'.repeat(50));
        
        let successCount = 0;
        let failCount = 0;
        
        for (let i = 0; i < internationalGuests.length; i++) {
            const guest = internationalGuests[i];
            console.log(`📱 Sending to ${guest.name} (${guest.phone}) (${i + 1}/${internationalGuests.length})...`);
            
            const result = await this.whatsappService.sendWeddingInvitation(guest);
            
            if (result.success) {
                console.log(`   ✅ Sent (ID: ${result.messageId})`);
                successCount++;
            } else {
                console.log(`   ❌ Failed: ${result.error}`);
                failCount++;
            }
            
            // Small delay between messages
            if (i < internationalGuests.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        console.log('\n🎊 International WhatsApp Send Complete!');
        console.log('─'.repeat(40));
        console.log(`✅ Successful: ${successCount}`);
        console.log(`❌ Failed: ${failCount}`);
        console.log(`📊 Total International: ${internationalGuests.length}`);
    }

    // Delete a specific guest
    async deleteGuest() {
        if (this.guests.length === 0) {
            console.log('❌ No guests found. Add guests first.');
            return;
        }
        
        console.log('\n🗑️ Delete Guest:');
        this.viewAllGuests();
        
        const guestIndex = await this.askQuestion('Enter guest number to delete: ');
        const index = parseInt(guestIndex) - 1;
        
        if (index >= 0 && index < this.guests.length) {
            const guest = this.guests[index];
            
            // Confirm deletion
            const confirm = await this.askQuestion(`\n⚠️ Are you sure you want to delete "${guest.name}"? This cannot be undone. (y/n): `);
            
            if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
                console.log(`\n🗑️ Deleting ${guest.name}...`);
                
                // Try to delete from database first
                let dbDeleted = false;
                if (this.dbInitialized) {
                    try {
                        const result = await guestDB.deleteGuestByToken(guest.accessCode);
                        if (result.success) {
                            console.log('✅ Guest deleted from RDS database');
                            dbDeleted = true;
                        } else {
                            console.log('⚠️ Failed to delete from database:', result.error);
                        }
                    } catch (error) {
                        console.log('⚠️ Database deletion failed:', error.message);
                    }
                }
                
                // Remove from local array
                this.guests.splice(index, 1);
                this.usedCodes.delete(guest.accessCode);
                
                // Update local file
                const fs = require('fs');
                try {
                    fs.writeFileSync('wedding-guests.json', JSON.stringify(this.guests, null, 2));
                    console.log('✅ Guest deleted from local file');
                } catch (error) {
                    console.log('⚠️ Failed to update local file:', error.message);
                }
                
                console.log(`\n🎊 Guest "${guest.name}" deleted successfully!`);
                console.log(`📊 Remaining guests: ${this.guests.length}`);
                
            } else {
                console.log('\n❌ Deletion cancelled.');
            }
        } else {
            console.log('❌ Invalid guest number.');
        }
    }

    // Clear all guests
    async clearAllGuests() {
        if (this.guests.length === 0) {
            console.log('❌ No guests found. Guest list is already empty.');
            return;
        }
        
        console.log(`\n🗑️ Clear All Guests (${this.guests.length} guests):`);
        console.log('⚠️ WARNING: This will delete ALL guest data from both database and local storage!');
        
        const confirm = await this.askQuestion('\n⚠️ Are you absolutely sure? Type "DELETE ALL" to confirm: ');
        
        if (confirm === 'DELETE ALL') {
            console.log('\n🗑️ Clearing all guests...');
            
            // Try to delete from database first
            let dbCleared = false;
            if (this.dbInitialized) {
                try {
                    // Delete all guests from database
                    for (const guest of this.guests) {
                        const result = await guestDB.deleteGuestByToken(guest.accessCode);
                        if (!result.success) {
                            console.log(`⚠️ Failed to delete ${guest.name} from database:`, result.error);
                        }
                    }
                    console.log('✅ All guests deleted from RDS database');
                    dbCleared = true;
                } catch (error) {
                    console.log('⚠️ Database clearing failed:', error.message);
                }
            }
            
            // Clear local arrays
            const deletedCount = this.guests.length;
            this.guests = [];
            this.usedCodes.clear();
            
            // Update local file
            const fs = require('fs');
            try {
                fs.writeFileSync('wedding-guests.json', JSON.stringify([], null, 2));
                console.log('✅ Local guest file cleared');
            } catch (error) {
                console.log('⚠️ Failed to clear local file:', error.message);
            }
            
            console.log(`\n🎊 All guests cleared successfully!`);
            console.log(`📊 Deleted ${deletedCount} guests`);
            console.log('📊 Current guest count: 0');
            
        } else {
            console.log('\n❌ Clear operation cancelled. (You must type "DELETE ALL" exactly)');
        }
    }

    // Sync local and database data
    async syncGuestData() {
        try {
            if (!this.dbInitialized) {
                console.log('⚠️ Database not connected. Cannot sync.');
                return;
            }
            
            console.log('\n🔄 Syncing guest data between local and database...');
            
            // Get all guests from database
            const dbResult = await guestDB.getAllGuests();
            if (!dbResult.success) {
                console.log('❌ Failed to fetch database guests:', dbResult.error);
                return;
            }
            
            const dbGuests = dbResult.guests.map(dbGuest => ({
                name: dbGuest.guest_name,
                email: dbGuest.email,
                phone: dbGuest.phone,
                type: dbGuest.guest_type,
                maxGuests: dbGuest.max_guests,
                accessCode: dbGuest.token,
                deviceFingerprint: dbGuest.device_fingerprint,
                createdAt: dbGuest.created_at,
                permissions: dbGuest.permissions
            }));
            
            // Update local data with database data
            this.guests = dbGuests;
            this.usedCodes.clear();
            this.guests.forEach(guest => {
                this.usedCodes.add(guest.accessCode);
            });
            
            // Update local file
            const fs = require('fs');
            try {
                fs.writeFileSync('wedding-guests.json', JSON.stringify(this.guests, null, 2));
                console.log('✅ Local file synced with database');
            } catch (error) {
                console.log('⚠️ Failed to update local file:', error.message);
            }
            
            console.log(`📊 Synced ${this.guests.length} guests`);
            
        } catch (error) {
            console.error('❌ Sync failed:', error.message);
        }
    }

    // Load existing guests from RDS database
    async loadExistingGuests() {
        try {
            // Try to load from database first
            if (!this.dbInitialized) {
                console.log('🔄 Initializing database connection...');
                const connected = await dbConnection.initialize();
                if (connected) {
                    await guestDB.initializeTables();
                    this.dbInitialized = true;
                }
            }

            if (this.dbInitialized) {
                const result = await guestDB.getAllGuests();
                if (result.success) {
                    // Convert database format to local format
                    this.guests = result.guests.map(dbGuest => ({
                        name: dbGuest.guest_name,
                        email: dbGuest.email,
                        phone: dbGuest.phone,
                        type: dbGuest.guest_type,
                        maxGuests: dbGuest.max_guests,
                        accessCode: dbGuest.token,
                        deviceFingerprint: dbGuest.device_fingerprint,
                        createdAt: dbGuest.created_at,
                        permissions: dbGuest.permissions
                    }));

                    // Rebuild used codes set
                    this.guests.forEach(guest => {
                        this.usedCodes.add(guest.accessCode);
                    });

                    console.log(`📂 Loaded ${this.guests.length} existing guests from RDS database.`);
                    return;
                }
            }

            // Fallback to local file if database fails
            console.log('🔄 Falling back to local file...');
            const fs = require('fs');
            if (fs.existsSync('wedding-guests.json')) {
                const data = fs.readFileSync('wedding-guests.json', 'utf8');
                this.guests = JSON.parse(data);
                
                // Rebuild used codes set
                this.guests.forEach(guest => {
                    this.usedCodes.add(guest.accessCode);
                });
                
                console.log(`📂 Loaded ${this.guests.length} existing guests from local file.`);
            }
        } catch (error) {
            console.error('❌ Error loading existing guests:', error.message);
            
            // Final fallback to local file
            const fs = require('fs');
            try {
                if (fs.existsSync('wedding-guests.json')) {
                    const data = fs.readFileSync('wedding-guests.json', 'utf8');
                    this.guests = JSON.parse(data);
                    
                    // Rebuild used codes set
                    this.guests.forEach(guest => {
                        this.usedCodes.add(guest.accessCode);
                    });
                    
                    console.log(`📂 Loaded ${this.guests.length} existing guests from local backup.`);
                }
            } catch (fileError) {
                console.error('❌ Error loading from local file:', fileError.message);
            }
        }
    }

    // Initialize the system
    async init() {
        console.log('🎊 Welcome to the Wedding Invitation System! 🎊');
        console.log('═'.repeat(60));
        console.log('This system will help you:');
        console.log('• Generate unique access codes for each guest');
        console.log('• Send beautiful email and SMS invitations');
        console.log('• Prevent code sharing with device fingerprinting');
        console.log('• Track access and manage your guest list');
        console.log('═'.repeat(60));
        
        // Load existing guests
        await this.loadExistingGuests();
        
        // Show main menu
        await this.showMenu();
    }
}

// Create and run the system
const invitationSystem = new WeddingInvitationSystem();

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n👋 Goodbye! Have a wonderful wedding! 💕');
    process.exit(0);
});

// Start the system
if (require.main === module) {
    invitationSystem.init().catch(console.error);
}

module.exports = WeddingInvitationSystem;
