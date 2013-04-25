if (Meteor.isClient) {
  Deps.autorun(function() {
    var spaceId = Session.get('currentSpace');
    if (spaceId) {
      Meteor.subscribe('messages', spaceId);
      Meteor.subscribe('links', spaceId);
      Meteor.subscribe('space-invites', spaceId);
      Meteor.subscribe('space-memberships', spaceId);
    }
  });

  Deps.autorun(function() {
    var ms = Memberships.find().fetch();
    var is = Invites.find().fetch();
    var spaceIds = _.pluck(ms.concat(is), 'spaceId');
    Meteor.subscribe('spaces', spaceIds);
  });

  Meteor.subscribe('my-memberships');
  Meteor.subscribe('my-invites');

  // XXX this is BAD
  Meteor.subscribe('allUserData');

  Accounts.ui.config({
    passwordSignupFields: 'USERNAME_AND_EMAIL'
  });

  Template.header.currentSpace = function() {
    var space = Spaces.findOne({_id: Session.get('currentSpace')})
    return space && space.name;
  }
  Template.header.events = {
    'click .title': function(e) {
      Router.setSpace(null);
      return false;
    }
  }

  Template.space.isMember = function() {
    return Memberships.findOne({spaceId: Session.get('currentSpace'), userId: Meteor.userId()});
  }

  Template.myInvitiationItem.events = {
    'click a.accept': function(e) {
      Meteor.call('acceptInvite', this)
      return false;
    }
  }

  Template.spaceList.memberSpaces = function() {
    var spaceIds = _.pluck(Memberships.find().fetch(), 'spaceId');
    return Spaces.find({_id: {$in: spaceIds}});
  }
  Template.spaceList.invitations = function() {
    var email = Meteor.user().emails && Meteor.user().emails[0].address;
    return email && Invites.find({email: email});
  }
  Template.spaceList.events = {
    'click .new': function(e) {
      var name = prompt('new space name:');
      Meteor.call('createSpace', {name: name}, function(err, result) {
        console.log(err, result);
        Router.setSpace(result);
      });
      return false;
    }
  }
  Template.spaceListItem.image = function() {
    return this.image || 'http://www.gravatar.com/avatar/'+md5(this._id)+'.jpg?d=monsterid&s=200'
  }
  Template.spaceListItem.createdBy = function() {
    // XXX generalize this
    var user = Meteor.users.findOne(this.userId);
    return user && user.username;
  }
  Template.spaceListItem.events = {
    'click': function(e) {
      Router.setSpace(this._id);
    }
  }

  Template.chatWindow.messages = function() {
    return Messages.find();
  }
  Template.chatWindow.events = {
    "submit form": function(e) {
      var $input = $(e.target).find('input');
      $input.attr('disabled', true);
      Meteor.call('post', {text: $input.val(), spaceId: Session.get('currentSpace')},
                  function(err, result) {
                    if (!err) {
                      $input.attr('disabled', false).val('');
                    }
      });
      return false;
    }
  }
  Template.chatWindow.rendered = function() {
    resizeChat();
    scrollChat();
  }

  Template.rightSideNav.rendered = function() {
    resizeChat();
  }

  Template.message.when = function() {
    return moment(this.created).format("HH:mm");
  }
  Template.message.user = function() {
    // XXX generalize this
    var user = Meteor.users.findOne(this.userId);
    return user && user.username;
  }

  Template.rightSideNav.userId = function() {
    var space = Spaces.findOne(Session.get('currentSpace'));
    return space && space.userId;
  }
  Template.admin.events = {
    'click .delete': function(e) {
      if (confirm('delete space permanently?')) {
        Meteor.call('deleteSpace', Session.get('currentSpace'));
        Router.setSpace(null);
      }
    }
  }

  Template.links.links = function() {
    return Links.find({}, {sort: {created: -1}, limit: 30});
  }
  Template.link.isOwner = function() {
    return this.userId === Meteor.userId();
  }
  Template.link.user = function() {
    // XXX generalize this
    var user = Meteor.users.findOne(this.userId);
    return user && user.username;
  }
  Template.link.when = function() {
    return moment(this.created).format("dddd, MMMM Do YYYY, HH:mm");
  }
  Template.link.link = function() {
    return '<a href="'+this.url+'" target="_blank">'+this.url+'</a>';
  }
  Template.link.inline = function() {
    var match = this.url.match(/youtube.com\/watch\?.*v=(.+)/)
    if (match) {
      var video_id = match[1];
      return '<iframe id="ytplayer" type="text/html" width="400px" height="300px" src="http://www.youtube.com/embed/'+video_id+'?autoplay=0&origin=http://smallspace.meteor.com frameborder="0"/>';
    } else {
      var match = this.url.match(/(jpg|gif|png)$/);
      if (match) {
        return '<a href="'+this.url+'" target="_blank"><img src="'+this.url+'" width="50%" /></a>'
      } else {
        return '';
      }
    }
  }
  Template.link.events = {
    'click .delete': function(e) {
      if (confirm('Delete this link? (NOTE: It will remain in the chat log)'))
        Links.remove(this._id);
    }
  };


  // XXX use a generic date helper for this:
  Template.inviteListItem.when = function() {
    return moment(this.created).fromNow();
  }

  Template.inviteListItem.events = {
    'click .cancel': function(e) {
      if (confirm('cancel invite for ' + this.email + '?'))
        Invites.remove(this._id);
      return false;
    }
  }

  Template.users.members = function() {
    return Memberships.find({spaceId: Session.get('currentSpace')});
  }
  Template.memberListItem.username = function() {
    // XXX generalize this
    var user = Meteor.users.findOne(this.userId);
    return user && user.username;
  }
  Template.users.invites = function() {
    return Invites.find({spaceId: Session.get('currentSpace')});
  }
  Template.users.events = {
    "submit form.invite": function(e) {
      e.preventDefault();
      var $inp = $(e.target).find('input');
      var addr = $inp.val();
      var space = Spaces.findOne(Session.get('currentSpace'));

      // XXX for now, just return if form is empty.  Should validate
      // email also, but server will throw exception if it cannot
      // deliver.
      if (!addr) return false;

      Meteor.call('inviteByEmail', addr, space, function(err, result) {
        console.log('returned from sending invite', err, result);
        if (err) {
          alert('error sending email');
        } else {
          $inp.val('');
        }
      });
      return false;
    }
  }

  Meteor.startup(function() {
    $(window).resize(function(evt) {
      resizeChat();
      scrollChat();
    });
    Backbone.history.start({pushState: true});
  });

  resizeChat = function() {
    var top = $('.chat-container .chat').position().top;
    var bot = $('.chat-container form').position().top;
    $('.chat-container .chat').height(bot - top);
    $('.links').height(bot-top);
  }

  scrollChat = function() {
    var $chat = $('.chat-container .chat');
    if (($chat.scrollTop() === 0)
        || (50 + $chat.scrollTop()) >= ($chat.prop('scrollHeight') - $chat.prop('offsetHeight'))) {
      $chat.scrollTop(1000000);
    }
  }

  // router
  var SpaceRouter = Backbone.Router.extend({
    routes: {
      "": "menu",
      ":spaceId/invite/:inviteId": "invite",
      ":spaceId": "main"
    },

    menu: function() {
      Session.set('currentSpace', null);
      Session.set('page', 'home');
    },

    invite: function(spaceId, inviteId) {
      Session.set('currentSpace', null);
      Session.set('currentInviteId', inviteId);
      Session.set('page', 'invite');
    },

    main: function(spaceId) {
      var oldSpace = Session.get('currentSpace');
      if (oldSpace !== spaceId) {
        Session.set('currentSpace', spaceId);
      }
      Session.set('page', 'space');
    },

    setSpace: function(spaceId) {
      this.navigate(spaceId, true);
    }
  });
  Router = new SpaceRouter;
}

if (Meteor.isServer) {
  Meteor.publish('messages', function(spaceId) {
    return Messages.find({spaceId: spaceId});
  });
  Meteor.publish('links', function(spaceId) {
    return Links.find({spaceId: spaceId});
  });
  Meteor.publish('space-invites', function(spaceId) {
    return Invites.find({spaceId: spaceId});
  });
  Meteor.publish('space-memberships', function(spaceId) {
    return Memberships.find({spaceId: spaceId});
  });
  Meteor.publish('my-memberships', function() {
    console.log('publish my-memberships')
    return Memberships.find({userId: this.userId});
  });
  Meteor.publish('my-invites', function() {
    console.log('publish my-invites', this.userId)
    var user = Meteor.users.findOne(this.userId);
    if (user)
      return Invites.find({email: user.emails[0].address});
  });

  Meteor.publish('spaces', function(spaceIds) {
    return Spaces.find({_id: {$in: spaceIds}, deleted: {$ne : true} } );
  });
  Meteor.publish('allUserData', function() {
    return Meteor.users.find();
  });

  Meteor.startup(function () {
    // code to run on server at startup
    //console.log(process.env);
  });
}
