const Segment = require('../models/Segment');
const Company = require('../models/Company');
const Contact = require('../models/Contact');

// @desc    Show the main segment management page
exports.getSegmentsPage = async (req, res) => {
  try {
    // 1. Get all companies (for the "Create" form dropdown)
    const companies = await Company.find();
    
    // 2. Get all existing segments and populate their company name
    const segments = await Segment.find().populate('company', 'name');

    // 3. Render the new EJS view
    res.render('segments', {
      companies: companies,
      segments: segments,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
    
  } catch (error) {
    console.error('Error fetching segments page:', error);
    res.status(500).send('Error loading page');
  }
};


// @desc    Handle adding a new segment
exports.addSegment = async (req, res) => {
  try {
    const { name, companyId } = req.body;

    // 1. Check if segment name already exists for that company
    const existingSegment = await Segment.findOne({ name: name, company: companyId });
    if (existingSegment) {
      req.flash('error_msg', 'A segment with this name already exists for this company.');
      return res.redirect('/segments');
    }

    // 2. Create the new segment
    const newSegment = new Segment({
      name: name,
      company: companyId
    });

    // 3. Save it to the database
    await newSegment.save();

    req.flash('success_msg', 'New segment created successfully.');
    res.redirect('/segments');
    
  } catch (error) {
    console.error('Error adding new segment:', error);
    res.status(500).send('Error adding segment');
  }
};


// @desc    Handle deleting a segment
exports.deleteSegment = async (req, res) => {
  try {
    const segmentId = req.params.id;

    // 1. (Safety Check) We must also remove this segment from all contacts
    //    This prevents "orphaned" segment IDs in the contacts collection
    await Contact.updateMany(
      { segments: segmentId }, // Find all contacts that have this segment
      { $pull: { segments: segmentId } } // Pull (remove) the segmentId from their array
    );

    // 2. Now it's safe to delete the segment itself
    await Segment.findByIdAndDelete(segmentId);

    req.flash('success_msg', 'Segment and all associations were deleted.');
    res.redirect('/segments');
    
  } catch (error) {
    console.error('Error deleting segment:', error);
    req.flash('error_msg', 'Error deleting segment. Note: Segments with associated contacts cannot be deleted.');
    res.redirect('/segments');
  }
};