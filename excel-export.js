const ExcelJS = require('exceljs');
const { guestDB, dbConnection } = require('./database');
require('dotenv').config();

class ExcelExporter {
    constructor() {
        this.workbook = new ExcelJS.Workbook();
    }

    // Export all guests to Excel
    async exportGuests() {
        try {
            // Initialize database if needed
            if (!dbConnection.isReady()) {
                await dbConnection.initialize();
                await guestDB.initializeTables();
            }

            // Get all guests
            const guestsResult = await guestDB.getAllGuests();
            if (!guestsResult.success) {
                throw new Error(guestsResult.error);
            }

            const guests = guestsResult.guests;

            // Create worksheet
            const worksheet = this.workbook.addWorksheet('Wedding Guests');

            // Define columns
            worksheet.columns = [
                { header: 'Guest Name', key: 'guest_name', width: 25 },
                { header: 'Email', key: 'email', width: 30 },
                { header: 'Phone', key: 'phone', width: 15 },
                { header: 'Access Code', key: 'token', width: 12 },
                { header: 'Guest Type', key: 'guest_type', width: 12 },
                { header: 'Max Guests', key: 'max_guests', width: 12 },
                { header: 'Permissions', key: 'permissions', width: 20 },
                { header: 'Created Date', key: 'created_at', width: 20 },
                { header: 'Active', key: 'is_active', width: 10 },
                { header: 'First Access', key: 'first_access_at', width: 20 },
                { header: 'Access Count', key: 'access_count', width: 12 }
            ];

            // Style the header row
            worksheet.getRow(1).font = { bold: true };
            worksheet.getRow(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD4A574' }
            };

            // Add data
            guests.forEach(guest => {
                worksheet.addRow({
                    guest_name: guest.guest_name,
                    email: guest.email,
                    phone: guest.phone,
                    token: guest.token,
                    guest_type: guest.guest_type,
                    max_guests: guest.max_guests,
                    permissions: Array.isArray(guest.permissions) ? guest.permissions.join(', ') : guest.permissions,
                    created_at: guest.created_at ? new Date(guest.created_at).toLocaleDateString() : '',
                    is_active: guest.is_active ? 'Yes' : 'No',
                    first_access_at: guest.first_access_at ? new Date(guest.first_access_at).toLocaleDateString() : 'Never',
                    access_count: guest.access_count || 0
                });
            });

            // Auto-fit columns
            worksheet.columns.forEach(column => {
                column.width = Math.max(column.width, 10);
            });

            console.log(`✅ Exported ${guests.length} guests to Excel`);
            return this.workbook;

        } catch (error) {
            console.error('❌ Error exporting guests:', error.message);
            throw error;
        }
    }

    // Export all RSVPs to Excel
    async exportRSVPs() {
        try {
            // Initialize database if needed
            if (!dbConnection.isReady()) {
                await dbConnection.initialize();
                await guestDB.initializeTables();
            }

            // Get all RSVPs
            const rsvpsResult = await guestDB.getAllRSVPs();
            if (!rsvpsResult.success) {
                throw new Error(rsvpsResult.error);
            }

            const rsvps = rsvpsResult.rsvps;

            // Create worksheet
            const worksheet = this.workbook.addWorksheet('RSVP Responses');

            // Define columns
            worksheet.columns = [
                { header: 'Guest Name', key: 'guest_name', width: 25 },
                { header: 'Email', key: 'email', width: 30 },
                { header: 'Phone', key: 'phone', width: 15 },
                { header: 'Attending', key: 'attending', width: 12 },
                { header: 'Guest Count', key: 'guest_count', width: 12 },
                { header: 'Submitted Date', key: 'submitted_at', width: 20 },
                { header: 'Confirmation ID', key: 'confirmation_id', width: 20 },
                { header: 'Invitation Guest', key: 'invitation_guest_name', width: 25 }
            ];

            // Style the header row
            worksheet.getRow(1).font = { bold: true };
            worksheet.getRow(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD4A574' }
            };

            // Add data
            rsvps.forEach(rsvp => {
                worksheet.addRow({
                    guest_name: rsvp.guest_name,
                    email: rsvp.email,
                    phone: rsvp.phone,
                    attending: rsvp.attending ? 'Yes' : 'No',
                    guest_count: rsvp.guest_count || 0,
                    submitted_at: rsvp.submitted_at ? new Date(rsvp.submitted_at).toLocaleDateString() : '',
                    confirmation_id: rsvp.confirmation_id,
                    invitation_guest_name: rsvp.invitation_guest_name
                });
            });

            // Color code attending vs not attending
            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber > 1) { // Skip header
                    const attendingCell = row.getCell('attending');
                    if (attendingCell.value === 'Yes') {
                        attendingCell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FF90EE90' } // Light green
                        };
                    } else if (attendingCell.value === 'No') {
                        attendingCell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFFFA07A' } // Light salmon
                        };
                    }
                }
            });

            console.log(`✅ Exported ${rsvps.length} RSVPs to Excel`);
            return this.workbook;

        } catch (error) {
            console.error('❌ Error exporting RSVPs:', error.message);
            throw error;
        }
    }

    // Export complete wedding data (guests + RSVPs)
    async exportComplete() {
        try {
            // Export guests
            await this.exportGuests();
            
            // Export RSVPs
            await this.exportRSVPs();

            // Add summary sheet
            await this.addSummarySheet();

            return this.workbook;

        } catch (error) {
            console.error('❌ Error exporting complete data:', error.message);
            throw error;
        }
    }

    // Add summary statistics sheet
    async addSummarySheet() {
        try {
            // Get data for summary
            const guestsResult = await guestDB.getAllGuests();
            const rsvpsResult = await guestDB.getAllRSVPs();

            if (!guestsResult.success || !rsvpsResult.success) {
                throw new Error('Failed to get data for summary');
            }

            const guests = guestsResult.guests;
            const rsvps = rsvpsResult.rsvps;

            // Create summary worksheet
            const worksheet = this.workbook.addWorksheet('Summary', { tabColor: { argb: 'FFD4A574' } });

            // Wedding info
            worksheet.addRow(['Wedding Summary Report']);
            worksheet.addRow(['Generated on:', new Date().toLocaleDateString()]);
            worksheet.addRow([]);

            // Guest statistics
            worksheet.addRow(['GUEST STATISTICS']);
            worksheet.addRow(['Total Invited Guests:', guests.length]);
            worksheet.addRow(['Active Invitations:', guests.filter(g => g.is_active).length]);
            worksheet.addRow(['Family Members:', guests.filter(g => g.guest_type === 'family').length]);
            worksheet.addRow(['Friends:', guests.filter(g => g.guest_type === 'friend').length]);
            worksheet.addRow(['Colleagues:', guests.filter(g => g.guest_type === 'colleague').length]);
            worksheet.addRow(['Guests Who Accessed Site:', guests.filter(g => g.access_count > 0).length]);
            worksheet.addRow([]);

            // RSVP statistics
            const attendingRSVPs = rsvps.filter(r => r.attending);
            const notAttendingRSVPs = rsvps.filter(r => !r.attending);
            const totalAttendingCount = attendingRSVPs.reduce((sum, r) => sum + (r.guest_count || 1), 0);

            worksheet.addRow(['RSVP STATISTICS']);
            worksheet.addRow(['Total RSVP Responses:', rsvps.length]);
            worksheet.addRow(['Attending (Parties):', attendingRSVPs.length]);
            worksheet.addRow(['Not Attending (Parties):', notAttendingRSVPs.length]);
            worksheet.addRow(['Total Attending (People):', totalAttendingCount]);
            worksheet.addRow(['Response Rate:', `${((rsvps.length / guests.length) * 100).toFixed(1)}%`]);
            worksheet.addRow([]);

            // Meal preferences (if available)
            const mealChoices = {};
            rsvps.forEach(rsvp => {
                if (rsvp.meal_choices && typeof rsvp.meal_choices === 'object') {
                    Object.entries(rsvp.meal_choices).forEach(([meal, choice]) => {
                        if (!mealChoices[choice]) mealChoices[choice] = 0;
                        mealChoices[choice]++;
                    });
                }
            });

            if (Object.keys(mealChoices).length > 0) {
                worksheet.addRow(['MEAL PREFERENCES']);
                Object.entries(mealChoices).forEach(([choice, count]) => {
                    worksheet.addRow([choice + ':', count]);
                });
                worksheet.addRow([]);
            }

            // Dietary restrictions
            const dietaryRestrictions = rsvps
                .filter(r => r.dietary_restrictions)
                .map(r => r.dietary_restrictions)
                .filter(d => d.trim().length > 0);

            if (dietaryRestrictions.length > 0) {
                worksheet.addRow(['DIETARY RESTRICTIONS']);
                dietaryRestrictions.forEach(restriction => {
                    worksheet.addRow(['•', restriction]);
                });
                worksheet.addRow([]);
            }

            // Style the summary sheet
            worksheet.getRow(1).font = { bold: true, size: 16 };
            worksheet.getRow(4).font = { bold: true, size: 12 };
            worksheet.getRow(12).font = { bold: true, size: 12 };

            // Set column widths
            worksheet.getColumn(1).width = 25;
            worksheet.getColumn(2).width = 15;

            console.log('✅ Added summary sheet');

        } catch (error) {
            console.error('❌ Error creating summary sheet:', error.message);
        }
    }

    // Save workbook to file
    async saveToFile(filename) {
        try {
            await this.workbook.xlsx.writeFile(filename);
            console.log(`✅ Excel file saved: ${filename}`);
            return filename;
        } catch (error) {
            console.error('❌ Error saving Excel file:', error.message);
            throw error;
        }
    }

    // Get workbook as buffer (for API responses)
    async getBuffer() {
        try {
            const buffer = await this.workbook.xlsx.writeBuffer();
            console.log('✅ Excel buffer generated');
            return buffer;
        } catch (error) {
            console.error('❌ Error generating Excel buffer:', error.message);
            throw error;
        }
    }
}

// CLI function to export data
async function exportWeddingData(type = 'complete') {
    try {
        const exporter = new ExcelExporter();
        const timestamp = new Date().toISOString().split('T')[0];
        let filename;

        switch (type) {
            case 'guests':
                await exporter.exportGuests();
                filename = `wedding-guests-${timestamp}.xlsx`;
                break;
            case 'rsvps':
                await exporter.exportRSVPs();
                filename = `wedding-rsvps-${timestamp}.xlsx`;
                break;
            case 'complete':
            default:
                await exporter.exportComplete();
                filename = `wedding-complete-${timestamp}.xlsx`;
                break;
        }

        await exporter.saveToFile(filename);
        console.log(`🎊 Export complete: ${filename}`);
        return filename;

    } catch (error) {
        console.error('❌ Export failed:', error.message);
        throw error;
    } finally {
        await dbConnection.close();
    }
}

// Run export if called directly
if (require.main === module) {
    const type = process.argv[2] || 'complete';
    exportWeddingData(type).catch(console.error);
}

module.exports = {
    ExcelExporter,
    exportWeddingData
};
